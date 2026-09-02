# Underwriting Review Example

An agent that triages commercial insurance submissions against an underwriting
guide: a reviewer subagent (code-called for the saved triage, model-dispatched
for what-if reviews), one knowledge file, four stores, an eval suite, a
custom single-screen UI, a Gmail connection whose read-only surface syncs
submissions in and whose confirm-gated surface emails outcomes back, guardrail
hooks, and two custom tools: a composite `analyze_submission` tool that runs
the deterministic triage around the subagent, and a pure `claims_stats` tool
the reviewer calls for the claims arithmetic. The agent logic runs on the
Amodal runtime, and the UI is a small React app the runtime serves for you.

Each submission is scored against a fictional carrier's underwriting guide, and the
agent returns a recommendation (`ready-to-quote`, `quote-with-conditions`,
`request-info`, `refer`, or `decline`), saves it, and, on the operator's
confirmation, emails it back to the broker.

This is **step 9** of a guided, incremental series. See
[The demo in steps](#the-demo-in-steps) to jump to any stage.

> Fictional demo. The agent recommends a workflow status and conditions only.
> It does not bind coverage, calculate premium, or give regulatory/legal
> advice.

## The demo in steps

This repo isn't one finished app: it's a guided build. Each step adds one
concept on top of the step before it, so the demo grows from "the simplest
thing that runs" to "shipped in a product" one idea at a time. Every past step
is a self-contained snapshot under `steps/`; **the repo root is always the
current step**. Two ways to use it:

- Open a step folder to see the whole app frozen at that stage: read its
  `README.md`, deploy it as-is.
- Diff two adjacent steps to see precisely what that one concept changed:
  `diff -r steps/08-custom-tool steps/09-model-delegation`.

**You are here: `steps/09-model-delegation`.** This README describes the app
at this step.

| Step                           | What you learn                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `steps/01-skills-and-knowledge`| The runtime loop and context compiler, and the core primitives: skills and knowledge                               |
| `steps/02-stores`              | Stores, and the CRUD tools Amodal generates so an agent can read and persist data                                  |
| `steps/03-code-vs-llm`         | Splitting work between code and the LLM: deterministic logic in a custom tool vs. judgment in a reviewer subagent  |
| `steps/04-evals`               | Evals as quality gates: pin the reviewer's judgment down before you build surfaces on top of it                    |
| `steps/05-custom-ui`           | Going beyond hosted chat: a custom UI with `runtimeApp`, and tool runs fired from the UI                           |
| `steps/06-guardrail-hooks`     | Guardrail hooks: one hard rule, enforced at the platform layer for every writer                                    |
| `steps/07-gmail-connection`    | Connecting to an external service, the surfaces it exposes, and read-only vs. confirm policies                     |
| `steps/08-custom-tool`         | Writing a custom tool when a Markdown skill and a schema aren't enough                                             |
| `steps/09-model-delegation`    | Model-initiated delegation: the chat agent dispatching a subagent itself via `call_subagent`                       |
| repo root (step 10)            | Background automations: scheduled runs that need no UI open, and a confirm gate with no human present              |

## The one idea this step teaches: model-initiated delegation

The underwriting-reviewer subagent has been in the app since step 3, but only
code has ever dispatched it: `analyze_submission` calls it via
`ctx.callSubagent`, at a fixed point in a fixed flow. Step 9 gives the chat
agent the same specialist, dispatched by the model itself, for the questions
no authored flow anticipates.

The gap. An operator asks: "if Bistro Ember's fire-safety inspection had been
received, what would the recommendation be?" Nothing in the stores changed, so
re-running `analyze_submission` answers the wrong question, and the chat model
answering from its own judgment would bypass everything the reviewer enforces:
the underwriting guide, the `claims_stats` arithmetic, the output contract.
The judgment exists, authored and evaled, one hop away. What's missing is a
way for the model to reach it.

Why not another custom tool? A `what_if` tool would have to anticipate every
hypothetical shape as schema fields: a received document, a removed claim, a
different building value. The hypothesis arrives in natural language, and
turning natural language into a well-posed task for a specialist is exactly
what the model is for. So the model decides _when_ to delegate and _phrases_
the hypothetical; the specialist it reaches stays authored, prompted, and
scoped.

What model-initiated delegation is. `call_subagent` is a runtime tool the
model can call with a specialist's name, a `task`, and structured `input`. The
subagent runs in its own isolated context with its own `AGENT.md` prompt and
its own tool grants ([`claims_stats` and `load_knowledge`](agents/underwriting-reviewer/agent.json)),
and returns its final text: the same JSON contract the composite parses. The
chat agent's context stays small; the reviewer's discipline stays intact.

The grant is explicit, again. `call_subagent` is not ambient: it registers
only for the specialists the agent's surface declares. Exposing the reviewer
to the chat agent is a one-line, reviewable diff in
[`agent.json`](agents/default/agent.json):
`"subagents": ["underwriting-reviewer"]`, the exact shape of step 8's
`"tools": ["claims_stats"]` grant, one level up.

Two callers, one specialist. The code path hands the reviewer everything as
input: the guide text and the authoritative missing-docs list, computed
deterministically. A model dispatch can't be trusted to paste a 5k-token guide
verbatim, so the reviewer covers the difference itself: when
`underwriting_guide` is absent it loads the knowledge document with
`load_knowledge`, and when `missing_required_documents` is absent it reads
completeness from `documents` plus what the task says to assume. Same
specialist, same output contract, two calling conventions.

The boundary it draws. A what-if is conversational and is never saved: saved
findings come only from `analyze_submission`, the chat prompt says so, and the
`ready-to-quote-guard` hook still gates every writer regardless. The
[`whatif-inspection-received`](evals/whatif-inspection-received.md) eval pins
all of it: the dispatch happens, the answer is labeled hypothetical, and no
store is written.

See the diff: `diff -r steps/08-custom-tool steps/09-model-delegation`.

## How it works

The two chat commands are triggers: a regex in the tool's own `tool.json`
fires the tool from the request path, before the LLM sees the message, and
the model then reports the tool's result:

- send **`seed`** → the
  [`seed_examples`](amodal/tools/seed_examples/tool.json) tool loads the demo
  submissions, their documents, and their claims into the stores. The UI runs
  the same tool over the invoke lane the first time it opens on an empty
  store, so the chat command only matters after something deleted a demo row.
- send **`analyze sub_bistro_ember`** (or `triage` / `review` / `assess` + an id)
  → the [`analyze_submission`](amodal/tools/analyze_submission/tool.json)
  composite tool runs the triage. As it works it narrates the deterministic
  steps into the chat's reasoning block (`ctx.emitReasoning`).

The UI buttons:

- **Reset demo data** → the [`reset_demo`](amodal/tools/reset_demo/tool.json)
  tool, behind a confirm modal: it removes every row in the four stores and
  loads the demo dataset again.
- the **Sync inbox** button →
  [`sync_submissions`](amodal/tools/sync_submissions/handler.ts), a durable
  tool on the direct-invoke lane (Gmail read-only surface): reads the broker
  mail and files submissions into the stores. Falls back to the demo dataset
  when no mailbox is connected.
- the **Analyze** button sends the same `analyze <id>` command through the
  chat surface (`RuntimeClient.chatStream`), so it enters through the same
  trigger as the chat command and cannot drift from it.
- the **Send reply** button →
  [`send_outcome`](amodal/tools/send_outcome/handler.ts), a durable tool on
  the direct-invoke lane (Gmail confirm surface): emails the decision back to
  the broker, only after the operator confirms the exact message.

Both buttons call `POST /api/tools/<name>/run` via `useToolRun`; the
`{"kind": "invoke"}` trigger in each tool's `tool.json` is the opt-in to that
lane, and neither tool is in any agent's `tools` list, so the model cannot
call them.

Both `analyze` entry points run the same four-stage Amodal loop, in the shared
[`runUnderwritingAnalysis`](amodal/_lib/underwriting-analysis.ts) behind the
composite tool. The tool declares everything it composes in `uses` (the store
tools and the reviewer subagent); undeclared calls fail closed:

1. **load**: reads the submission, its `documents`, and its `claims` from the
   stores via the auto-generated `store__*__get` / `store__*__query` tools
   (`ctx.callTool`).
2. **check (in code)**: computes the completeness check deterministically in
   TypeScript: any `required` document whose status isn't `received` is missing,
   full stop. A rule, not a judgment, so code decides it and hands the reviewer
   the result as fact.
3. **review (in the subagent)**: `ctx.callSubagent` runs the
   [`underwriting-reviewer`](agents/underwriting-reviewer/AGENT.md) subagent,
   which applies the [underwriting guide](amodal/knowledge/underwriting-guide.md)
   (passed in as input; subagents see only their own prompt) and makes the
   judgment a formula can't (eligibility, hazards, claims severity, one
   recommendation). Mid-review it calls the
   [`claims_stats`](amodal/tools/claims-stats/tool.ts) custom tool for the
   claims arithmetic (counts, the 3-year window from the real clock, largest
   amount, open claims) and treats those numbers as fact. Judging the repeat
   cause stays its own job. Its reply is a single JSON object the composite
   parses.
4. **record**: code holds the floor on the way out: it folds the deterministic
   missing-docs list into the finding and won't let a packet with missing
   required docs be `ready-to-quote`. Then it writes a `risk_findings` row,
   stamps the submission, and reports: the model summarizes the tool result in
   chat, and the UI refetches its `useStoreQuery` data. The
   `ready-to-quote-guard` hook backstops that last rule for every writer.

What-if questions take a different path. They don't match the `analyze`
trigger, so they reach the model, and the chat prompt tells it to delegate:
read the submission's rows from the stores, then dispatch the
underwriting-reviewer via `call_subagent` with the rows as `input` and the
hypothetical stated in the `task`. The reviewer loads the guide itself
(`load_knowledge`), calls `claims_stats` for the arithmetic as always, and
returns the same JSON shape. The model reports it as a hypothetical and writes
nothing: the stored finding is whatever `analyze_submission` last saved.

Once a submission has a finding, **Send reply** runs `send_outcome`: it loads the
submission + its finding, composes the broker email, and calls `send_message`.
The `outbound-reply-guard` hook blocks that send if the submission was never
triaged: the confirm policy, made true for every caller.

How do submissions arrive? The first time the screen opens on an empty
store, the UI runs `seed_examples` over the invoke lane and the five demo
submissions land in the stores. Real mail comes through **Sync inbox**
(`sync_submissions`, the read-only surface): with a mailbox connected it reads
real broker mail; with none it confirms the demo is already filed. **Reset
demo data** empties the stores and seeds them again, and the `seed` chat
command (a regex trigger on the same tool, idempotent) loads whatever is
missing. Either way, a run doesn't see its own uncommitted writes: `analyze`
reads already-committed data from a prior seed or sync, and on fresh stores
it falls back to the in-memory demo examples while seeding the stores for
later runs.

## What's in here

| Path                                                  | What it is                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `amodal.json`                                         | Manifest: four stores, the `gmail` package, and `runtimeApp: { custom: true }`.                                                |
| `agents/default/`                                     | The chat agent (`agent.json` + `AGENT.md`): the implicit default surface; its config scopes the session's tools, stores, and now its dispatchable `subagents`. |
| `agents/underwriting-reviewer/`                       | The reviewer subagent that scores against the underwriting guide. Its `agent.json` grants `claims_stats` + `load_knowledge`.   |
| `amodal/connections/gmail/`                           | The Gmail connection: `spec.json` (bound by `protocol`, env-based token) + README. Read + confirm surfaces.                    |
| `amodal/tools/analyze_submission/`                    | The composite triage tool (`tool.json` + `handler.ts`): declares its `uses` (store tools + the reviewer) and the `analyze` regex trigger. |
| `amodal/tools/seed_examples/`                         | The durable seeding tool: the UI runs it over the invoke lane on first open, the `seed` regex trigger runs it from chat. |
| `amodal/tools/reset_demo/`                            | Durable invoke-lane tool for **Reset demo data**: lists and removes every row in the four stores, then seeds blind. |
| `amodal/tools/claims-stats/`                          | The custom tool: deterministic claims arithmetic the reviewer calls mid-reasoning. Numbers, never verdicts.                    |
| `evals/`                                              | The eval suite from step 4, grown with each step; `whatif-inspection-received` covers the new dispatch path. Re-run it before promoting. |
| `amodal/tools/sync_submissions/`                      | Durable invoke-lane tool for **Sync inbox**: the Gmail read-only surface (`read_messages` + offline fallback).                 |
| `amodal/tools/send_outcome/`                          | Durable invoke-lane tool for **Send reply**: the Gmail confirm surface (`send_message`), operator-gated.                       |
| `amodal/_lib/underwriting-analysis.ts`                | The shared triage behind the composite tool: both entry points run it, so they can't drift.                                    |
| `amodal/_lib/reset.ts`                                | `resetDemo`: the remove-then-seed sequence behind `reset_demo`.                                |
| `amodal/_types/tool-context.ts`                       | Vendored custom-tool types (`CustomToolContext` / `ToolDefinition`), kept local so the example typechecks offline.             |
| `amodal/knowledge/underwriting-guide.md`              | The fictional underwriting guide the reviewer reasons over (passed to it as input).                                            |
| `amodal/stores/`                                      | 4 store schemas: `submissions` (now with `broker_email` + reply state), `documents`, `claims`, `risk_findings`. All `deletable`, which registers the `__remove` tools the reset uses. |
| `amodal/_lib/examples.ts` / `demo-data.ts`            | The demo dataset and the code that hydrates it into the stores.                                                                |
| `hooks/ready-to-quote-guard/`                         | `preToolUse` guard enforcing the missing-docs rule for every writer.                                                           |
| `hooks/outbound-reply-guard/`                         | `preToolUse` guard on `send_message`: no reply before a submission is triaged.                                                 |
| `src/`                                                | The custom React UI (Vite): one screen, `useStoreQuery` + `useToolRun` (seed/reset/Sync/Send) + the chat-trigger Analyze button, the Send-reply and Reset confirm modals. |
| `.env.example`                                        | The Gmail env vars (all optional, unset runs offline).                                                                          |
| `index.html` · `vite.config.ts` · `tsconfig.app.json` | SPA entry + build config.                                                                                                      |

## Example cases

The five submissions shipped in `examples.ts`:

| Submission                | Why                                                               | Expected recommendation  |
| ------------------------- | ----------------------------------------------------------------- | ------------------------ |
| Bistro Ember LLC          | Missing fire-safety inspection + two kitchen fires (repeat cause) | `request-info` / `refer` |
| Cascade Print Works       | Three aged claims, distinct causes, only one in the real 3-year window | `ready-to-quote`    |
| Summit Yoga Studio        | Complete packet, no claims, eligible                              | `ready-to-quote`         |
| Northstar Storage         | 22-yr roof, hail region, clean claims                             | `quote-with-conditions`  |
| Vacant Millworks Building | Vacant, ineligible                                                | `decline`                |

## Running it

Deploy the app to Amodal. The runtime serves the custom UI on the agent's domain
and the agent chat alongside it. It runs with no credentials: the Gmail
connection loads non-fatally, so every step works offline:

1. Open the submissions screen (the custom UI). The five demo submissions
   load into the stores on first open. With `GMAIL_ACCESS_TOKEN` set,
   **Sync inbox** reads the real broker inbox. **Reset demo data** puts the
   stores back to the demo dataset.
2. Click **Analyze** on a row to triage it: the saved recommendation, risk score,
   missing-info list, and a claims line appear inline. (You can still triage from
   chat with `analyze <id>`. Both enter through the same trigger.) The claims
   line is the custom tool made visible: mid-review the reviewer calls
   `claims_stats` and must cite its numbers, so the note reads like `1 of 3
   claims in the 2024-2026 window (as of 2026); largest $21k; no repeat cause`.
   The "as of" year comes from the real clock. The model does not know today's
   date, so that number is the tool's fingerprint. Two cases exercise the two
   halves of the claims rules: Bistro Ember for the judgment half (the reviewer
   spots the repeat kitchen fires) and Cascade Print Works for the arithmetic
   half (three claims that look like a frequency problem until the real window
   places only one of them inside it, so it stays `ready-to-quote`).
3. Ask a what-if in the chat: `For sub_bistro_ember: if the fire-safety
   inspection had been received, what would the recommendation likely be?`
   Watch the reasoning block: the model reads the rows from the stores, then
   dispatches the underwriting-reviewer with `call_subagent`, and reports the
   reviewer's hypothetical verdict. The table doesn't change: nothing was
   saved, and re-analyzing still yields the real (missing-inspection) triage.
4. Click **Send reply** to email the outcome back to the broker. Review the exact
   message in the modal and **Confirm**. That operator confirmation is the gate
   on the write surface. Offline, the send is captured by the dev outbox
   (`GMAIL_DEV_OUTBOX`). With `GMAIL_FROM_ADDRESS` set it goes out over Gmail.

- `sub_bistro_ember` · `sub_cascade_printworks` · `sub_summit_yoga` · `sub_northstar_storage` · `sub_vacant_millworks`

See the grant's value in one edit. The whole delegation lives in one line of
the chat agent's config, so removing it takes the capability away: delete the
`"subagents"` line from `agents/default/agent.json`. Redeploy and ask the
what-if again: with no `call_subagent` registered, the model has no path to
the reviewer and must either answer from its own judgment (unguided, no
`claims_stats`, no guide discipline) or decline. That contrast is the lesson:
the specialist is a granted capability, not a prompt convention. Restore with
`git checkout main -- steps/09-model-delegation/agents/default/agent.json`. (Step 8's version of the
same experiment: empty the reviewer's `"tools"` list and watch the claims
window drift to the model's training-data sense of what year it is.)

To talk to a real mailbox, copy `.env.example` to `.env` and set
`GMAIL_ACCESS_TOKEN` (+ `GMAIL_FROM_ADDRESS` to send). See
[`amodal/connections/gmail/README.md`](amodal/connections/gmail/README.md).

### Developing the UI locally

```sh
npm install
npm run dev        # Vite dev server; talks to a runtime at VITE_RUNTIME_URL (default http://localhost:3001)
npm run build      # production build → dist/ (what the cloud build uploads)
npm run typecheck  # typechecks both the runtime code (amodal/) and the SPA (src/)
```

## Configuration

- `amodal/_lib/examples.ts`: the demo submissions the UI loads on first open
  (and `seed`, **Reset demo data**, and the offline **Sync inbox** fallback).
  Edit it and redeploy to change the dataset; click **Reset demo data** to see
  the edit. Each entry is self-contained, with embedded `docs[]`, `claims[]`,
  and a `broker_email`.
- `amodal/connections/gmail/spec.json`: binds the driver by `protocol` and maps
  the token / from-address / dev-outbox to env vars. `.env.example` documents them,
  all optional, unset runs offline.
- `amodal.json` manifest: the four stores, the `gmail` package, and
  `runtimeApp`. The chat surface itself is `agents/default/` (its `agent.json`
  scopes the session's tools, stores, and dispatchable `subagents`; its
  `AGENT.md` is the prompt).
- `amodal/tools/analyze_submission/tool.json`: the composite triage tool. Its
  `uses` block is the reviewable list of everything the flow may compose
  (store tools + the reviewer subagent), and `triggers` holds the `analyze`
  regex that fires it from chat.
- `amodal/tools/claims-stats/tool.ts`: the custom tool. The parameters schema
  and description are what the LLM sees. Edit `handle` to change the
  arithmetic. It deliberately returns numbers, not verdicts: thresholds live
  in `underwriting-guide.md`. The reviewer's `agent.json` `tools` list is the grant.
- `hooks/*/hook.json`: the guards' config: `ready-to-quote-guard` (which write
  tools it gates, which recommendation it blocks on missing docs) and
  `outbound-reply-guard` (which send tool it gates).
- `evals/*.md`: the eval suite, grown step by step; `whatif-inspection-received.md`
  pins the dispatch path. Re-run it after any edit here.
- `amodal.json` sets `memory.enabled: false`. Durable state lives in
  the stores, so each triage is a pure function of what is in them and there is
  nothing to carry across sessions in conversation memory.
