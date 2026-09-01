# Underwriting Review Example

An agent that triages commercial insurance submissions against an underwriting
guide: a reviewer subagent, one knowledge file, four stores, an eval suite, a
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

This is **step 8** of a guided, incremental series. See
[The demo in steps](#the-demo-in-steps) to jump to any stage.

> Fictional demo. The agent recommends a workflow status and conditions only.
> It does not bind coverage, calculate premium, or give regulatory/legal
> advice.

## The demo in steps

This repo isn't one finished app: it's a guided build. Each step adds one
concept on top of the step before it, so the demo grows from "the simplest
thing that runs" to "shipped in a product" one idea at a time. Every past step
is a self-contained snapshot under [`steps/`](steps/); **the repo root is
always the current step**. Two ways to use it:

- Open a step folder to see the whole app frozen at that stage: read its
  `README.md`, deploy it as-is.
- Diff two adjacent steps to see precisely what that one concept changed:
  `diff -r steps/05-custom-ui steps/06-guardrail-hooks`. To diff the last
  snapshot against the current step (the root):
  `diff -r -x steps -x node_modules -x dist steps/07-gmail-connection .`

**You are here: step 8**, the repo root. This README describes the app at
this step.

| Step                                                    | What you learn                                                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`steps/01`](steps/01-skills-and-knowledge/)            | The runtime loop and context compiler, and the core primitives: skills and knowledge                           |
| [`steps/02`](steps/02-stores/)                          | Stores, and the CRUD tools Amodal generates so an agent can read and persist data                              |
| [`steps/03`](steps/03-code-vs-llm/)                     | Splitting work between code and the LLM: deterministic logic in a custom tool vs. judgment in a reviewer subagent |
| [`steps/04`](steps/04-evals/)                           | Evals as quality gates: pin the reviewer's judgment down before you build surfaces on top of it                |
| [`steps/05`](steps/05-custom-ui/)                       | Going beyond hosted chat: a custom UI with `runtimeApp`, and tool runs fired from the UI                       |
| [`steps/06`](steps/06-guardrail-hooks/)                 | Guardrail hooks: one hard rule, enforced at the platform layer for every writer                                |
| [`steps/07`](steps/07-gmail-connection/)                | Connecting to an external service, the surfaces it exposes, and read-only vs. confirm policies                 |
| **step 8** (repo root, you are here)                    | Writing a custom tool when a Markdown skill and a schema aren't enough                                         |
| step 9 _(planned)_                                      | Delegating a sub-task to a separate scoped agent in `agents/` when a single skill isn't the right unit of work |
| step 10 _(planned)_                                     | Background automations: scheduled and webhook runs that need no UI open                                        |
| step 11 _(planned)_                                     | Session types & memory: one deployed agent, different modes with different capabilities                        |
| step 12 _(planned)_                                     | Embedding & multi-tenancy: the agent in your own app, with your auth and a `scope_id` per tenant               |

> See [`steps/README.md`](steps/README.md) for how the step snapshots are
> maintained and how new steps are added.

## The one idea this step teaches: a custom tool

Every tool the agent has used so far came from the platform: the `store__*`
CRUD tools generated from a schema (step 2), and the connection tools a driver
package registers (step 7). Step 8 writes one by hand, for the case where
what's missing is deterministic code the LLM itself needs to call while it
reasons.

The gap. The [underwriting guide](amodal/knowledge/underwriting-guide.md)'s claims
rules are half arithmetic ("3+ claims in the last 3 years", "any single claim
over $100k", "an open claim") and half judgment (a repeat claim of the same
cause, severity in context). The arithmetic is exactly what an LLM is
unreliable at: counting, summing, and, worst of all, knowing what year it is. "The
last 3 years" is relative to today, and a model's sense of "today" is whatever
its training data says. More prompt markdown can't fix that, and no store
schema holds it. A prompt and a schema aren't enough. The dataset ships a case
this arithmetic decides: Cascade Print Works, three aged claims where only
one falls in the real window (see Example cases).

Why not use the same approach as step 3? The missing-docs check had the same shape (a rule,
not a judgment) and was solved by computing it in code, before the
reviewer runs, passing the result in as fact. That works when code knows in
advance what the reviewer will need. The claims numbers are needed
mid-reasoning, so the dependency runs the other way: the reviewer keeps the
judgment and _pulls_ the deterministic answer when it gets to the claims
card.

What a custom tool is. A directory under
[`amodal/tools/`](amodal/tools/claims-stats/tool.ts) whose `tool.ts`
default-exports a definition: an `id`, an `exposure`, a description + JSON
Schema for the parameters (what the LLM sees), and a `handle` function (the
code that runs). The runtime compiles and registers it beside the generated
and driver tools: one registry, one calling convention.
[`claims_stats`](amodal/tools/claims-stats/tool.ts) is a pure function of its
input: the reviewer hands it the claims array and gets back the counts, the
3-year window (computed from the real clock), the largest and total amounts,
and the number of open claims.

The boundary it draws. The tool returns numbers, never verdicts: the
thresholds stay in the underwriting guide, and applying them, plus judging
whether "Grease fire in the kitchen" and "Small kitchen fire" are the same
cause, stays in the reviewer. The division of labor is the same as in step 3
(code computes, the LLM judges), just at a new call site: inside the LLM's
own loop.

The grant is explicit. An agent's tool list is closed by default. Exposing
the tool to the reviewer is a one-line, reviewable diff in
[`agent.json`](agents/underwriting-reviewer/agent.json):
`"tools": ["claims_stats"]`. And because the tool has no outside side
effect, its `exposure` is `open`: no confirm gate, unlike step 7's
`send_message`.

See the diff: `diff -r -x steps -x node_modules -x dist steps/07-gmail-connection .`

## How it works

The two chat commands are triggers: a regex in the tool's own `tool.json`
fires the tool from the request path, before the LLM sees the message, and
the model then reports the tool's result:

- send **`seed`** once → the
  [`seed_examples`](amodal/tools/seed_examples/tool.json) tool loads the demo
  submissions, their documents, and their claims into the stores.
- send **`analyze sub_bistro_ember`** (or `triage` / `review` / `assess` + an id)
  → the [`analyze_submission`](amodal/tools/analyze_submission/tool.json)
  composite tool runs the triage. As it works it narrates the deterministic
  steps into the chat's reasoning block (`ctx.emitReasoning`).

The UI buttons:

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

Once a submission has a finding, **Send reply** runs `send_outcome`: it loads the
submission + its finding, composes the broker email, and calls `send_message`.
The `outbound-reply-guard` hook blocks that send if the submission was never
triaged: the confirm policy, made true for every caller.

How do submissions arrive now? The primary path is **Sync inbox**
(`sync_submissions`, the read-only surface): with a mailbox connected it reads
real broker mail. With none, it loads the five demo submissions from the dataset.
The `seed` chat command still works as an offline shortcut: it's a regex
trigger on the `seed_examples` tool, so a chat message fires it, and it's
idempotent, safe to resend. Either way, a run doesn't see its own uncommitted
writes: `analyze` reads already-committed data from a prior sync or seed, and
on fresh stores it falls back to the in-memory demo examples while seeding the
stores for later runs.

## What's in here

| Path                                                  | What it is                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `amodal.json`                                         | Manifest: four stores, the `gmail` package, and `runtimeApp: { custom: true }`.                                                |
| `agents/default/`                                     | The chat agent (`agent.json` + `AGENT.md`): the implicit default surface; its config scopes the session's tools and stores.    |
| `agents/underwriting-reviewer/`                       | The reviewer subagent that scores against the underwriting guide. Its `agent.json` grants `claims_stats`.                      |
| `amodal/connections/gmail/`                           | The Gmail connection: `spec.json` (bound by `protocol`, env-based token) + README. Read + confirm surfaces.                    |
| `amodal/tools/analyze_submission/`                    | The composite triage tool (`tool.json` + `handler.ts`): declares its `uses` (store tools + the reviewer) and the `analyze` regex trigger. |
| `amodal/tools/seed_examples/`                         | The seeding tool behind the `seed` trigger (offline shortcut).                                                                 |
| `amodal/tools/claims-stats/`                          | The custom tool: deterministic claims arithmetic the reviewer calls mid-reasoning. Numbers, never verdicts.                    |
| `evals/`                                              | The eval suite from step 4, plus `analyze-repeat-claims` and `analyze-claims-window` covering the new tool. Re-run it before promoting. |
| `amodal/tools/sync_submissions/`                      | Durable invoke-lane tool for **Sync inbox**: the Gmail read-only surface (`read_messages` + offline fallback).                 |
| `amodal/tools/send_outcome/`                          | Durable invoke-lane tool for **Send reply**: the Gmail confirm surface (`send_message`), operator-gated.                       |
| `amodal/_lib/underwriting-analysis.ts`                | The shared triage behind the composite tool: both entry points run it, so they can't drift.                                    |
| `amodal/_types/tool-context.ts`                       | Vendored custom-tool types (`CustomToolContext` / `ToolDefinition`), kept local so the example typechecks offline.             |
| `amodal/knowledge/underwriting-guide.md`              | The fictional underwriting guide the reviewer reasons over (passed to it as input).                                            |
| `amodal/stores/`                                      | 4 store schemas: `submissions` (now with `broker_email` + reply state), `documents`, `claims`, `risk_findings`.                |
| `amodal/_lib/examples.ts` / `demo-data.ts`            | The demo dataset and the code that hydrates it into the stores.                                                                |
| `hooks/ready-to-quote-guard/`                         | `preToolUse` guard enforcing the missing-docs rule for every writer.                                                           |
| `hooks/outbound-reply-guard/`                         | `preToolUse` guard on `send_message`: no reply before a submission is triaged.                                                 |
| `src/`                                                | The custom React UI (Vite): one screen, `useStoreQuery` + `useToolRun` (Sync/Send) + the chat-trigger Analyze button, the Send-reply confirm modal. |
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

1. Open the submissions screen (the custom UI) and click **Sync inbox**. With
   no mailbox connected it loads the five demo submissions from the dataset. With
   `GMAIL_ACCESS_TOKEN` set it reads the real broker inbox. (Offline, you can also
   send `seed` in the agent chat.)
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
3. Click **Send reply** to email the outcome back to the broker. Review the exact
   message in the modal and **Confirm**. That operator confirmation is the gate
   on the write surface. Offline, the send is captured by the dev outbox
   (`GMAIL_DEV_OUTBOX`). With `GMAIL_FROM_ADDRESS` set it goes out over Gmail.

- `sub_bistro_ember` · `sub_cascade_printworks` · `sub_summit_yoga` · `sub_northstar_storage` · `sub_vacant_millworks`

See the tool's value in one edit. The whole `claims_stats` grant lives in the
reviewer's config, so removing it takes the tool away: set
`"tools": []` in `agents/underwriting-reviewer/agent.json`. Redeploy and
re-analyze Cascade Print Works: with no `claims_stats` to call, the reviewer
dates the claims from its training-data sense of what year it is. Watch the
window in its claims reasoning shift, and often the recommendation degrade with
it, three distinct old claims read as "3+ in the last 3 years". Restore with
`git checkout main -- agents/underwriting-reviewer/agent.json`.

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

- `amodal/_lib/examples.ts`: the demo submissions that `seed` and the offline
  **Sync inbox** fallback load. Edit it and redeploy to change the dataset. Each
  entry is self-contained, with embedded `docs[]`, `claims[]`, and a `broker_email`.
- `amodal/connections/gmail/spec.json`: binds the driver by `protocol` and maps
  the token / from-address / dev-outbox to env vars. `.env.example` documents them,
  all optional, unset runs offline.
- `amodal.json` manifest: the four stores, the `gmail` package, and
  `runtimeApp`. The chat surface itself is `agents/default/` (its `agent.json`
  scopes the session's tools and stores; its `AGENT.md` is the prompt).
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
- `evals/*.md`: the eval suite from step 4 plus `analyze-repeat-claims.md` and
  `analyze-claims-window.md`. Re-run it after any edit here.
- `amodal.json` sets `memory.enabled: false`. Durable state lives in
  the stores, so each triage is a pure function of what is in them and there is
  nothing to carry across sessions in conversation memory.
