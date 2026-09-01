# Underwriting Review Example

An agent that triages commercial insurance submissions against an underwriting
guide: a reviewer subagent (code-called for the saved triage, model-dispatched
for what-if reviews), one knowledge file, four stores, an eval suite, a
custom single-screen UI, a Gmail connection whose read-only surface syncs
submissions in and whose confirm-gated surface emails outcomes back (with a
daily auto-sync automation that needs no UI open), agent memory for the
desk's standing guidance, a conditional surface that withholds human-only
capabilities from headless runs, guardrail
hooks, and two custom tools: a composite `analyze_submission` tool that runs
the deterministic triage around the subagent, and a pure `claims_stats` tool
the reviewer calls for the claims arithmetic. The agent logic runs on the
Amodal runtime, and the UI is a small React app the runtime serves for you.

Each submission is scored against a fictional carrier's underwriting guide, and the
agent returns a recommendation (`ready-to-quote`, `quote-with-conditions`,
`request-info`, `refer`, or `decline`), saves it, and, on the operator's
confirmation, emails it back to the broker.

This is **step 11** of a guided, incremental series. See
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
  `diff -r -x steps -x node_modules -x dist steps/10-automations .`

**You are here: step 11**, the repo root. This README describes the app at
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
| [`steps/08`](steps/08-custom-tool/)                     | Writing a custom tool when a Markdown skill and a schema aren't enough                                         |
| [`steps/09`](steps/09-model-delegation/)                | Model-initiated delegation: the chat agent dispatching a subagent itself via `call_subagent`                   |
| [`steps/10`](steps/10-automations/)                     | Background automations: scheduled runs that need no UI open, and what a confirm gate means with no human present |
| **step 11** (repo root, you are here)                   | Memory and conditional surfaces: one deployed agent whose capabilities vary per caller (`claims`, `humanPresent`)          |
| step 12 _(planned)_                                     | Embedding & multi-tenancy: the agent in your own app, with your auth and a `scope_id` per tenant               |

> See [`steps/README.md`](steps/README.md) for how the step snapshots are
> maintained and how new steps are added.

## The one idea this step teaches: capabilities that depend on the caller

One agent is deployed, but not every caller should hold the same surface. Step
11 makes two capability decisions depend on who — or what — is asking, and
gives the agent a place to keep what a caller tells it.

The setup step 10 created. Sessions now start two ways: an operator in the
chat, and a scheduled binding with nobody present. Two of the chat agent's
capabilities silently assumed a person. `seed_examples` is an operator's
offline shortcut; a headless run that "seeds" over a real mailbox sync would
fake data with no one to notice. The reviewer dispatch (step 9) exists to
answer a person mid-conversation; a headless run has nobody asking. Telling
the model "don't use these when running unattended" would be a request. Not
holding the tool is a fact.

What a conditional surface is. [`agent.ts`](agents/default/agent.ts) is the
code form of `agent.json`, and the only form that can carry a predicate: any
entry may be `{name, conditional}`, where the conditional is a synchronous,
pure function of the caller context (`claims`, `context`, `scopeId`,
`humanPresent`, `isSubagent`). Both capabilities above are now gated on
`ctx.humanPresent`, which the platform derives from how the run was triggered:
false for automation, webhook, and backfill runs, and not forgeable from a
request body. The declarative rest (name, description, stores) stays in
`agent.json`; where both files set a field, `agent.ts` wins.

The rules that make it safe. A predicate can only **subtract**: the entries
written in the file are the ceiling, so "what can this agent do, at most" is
still answerable by reading it. Everything **fails closed**: a predicate that
throws, or a session with no caller context, excludes the entry rather than
granting it. And the one thing to get right: `ctx.context` is client-supplied
(fine for curation, like picking a playbook); a predicate that exists to
*withhold* something must read verified facts: `ctx.claims` (JWT) or, as
here, `humanPresent`. This demo runs with identity `none`, so its gate reads
`humanPresent`; a real deployment with JWT auth gates roles on `claims`.

Memory, finally. `amodal.json` set `memory.enabled: false` for nine steps,
with a reason: triage state lives in the stores, and a triage must stay a pure
function of them. That reason still stands, and enabling memory doesn't touch
it, because memory holds a different kind of thing: the desk's standing
guidance. "We're not writing vacant buildings this quarter." "Keep broker
replies short." Statements an operator makes once and expects to hold next
week, in a new session. Memory keeps one fact per entry, recalled into the
system prompt across sessions, capped (`maxEntries: 50`) and editable through
the built-in memory tool (`editableBy: "any"`). The
[prompt](agents/default/AGENT.md) draws the line: guidance in memory, facts in
stores, and the stores and the underwriting guide win on any conflict.

See the diff: `diff -r -x steps -x node_modules -x dist steps/10-automations .`

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
- the **Auto-sync daily** toggle → `useAutomation()`: creates (then
  enables/disables) a platform-managed binding that runs `sync_submissions`
  once a day with no UI open. The management surface lives in the cloud
  runtime, so locally the toggle degrades to a "cloud only" note.

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

What-if questions take a different path (and only for a present human: the
dispatch entry is conditional in `agent.ts`). They don't match the `analyze`
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

How do submissions arrive now? The primary path is `sync_submissions` (the
read-only surface), fired by the **Sync inbox** button or, once **Auto-sync
daily** is on, by the scheduled binding with nobody watching: with a mailbox
connected it reads real broker mail. With none, it loads the five demo
submissions from the dataset.
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
| `agents/default/`                                     | The chat agent: `AGENT.md` (prompt), `agent.json` (stores), and `agent.ts`, the code form whose tool/subagent entries carry `humanPresent` conditionals. |
| `agents/underwriting-reviewer/`                       | The reviewer subagent that scores against the underwriting guide. Its `agent.json` grants `claims_stats` + `load_knowledge`.   |
| `amodal/connections/gmail/`                           | The Gmail connection: `spec.json` (bound by `protocol`, env-based token) + README. Read + confirm surfaces.                    |
| `amodal/tools/analyze_submission/`                    | The composite triage tool (`tool.json` + `handler.ts`): declares its `uses` (store tools + the reviewer) and the `analyze` regex trigger. |
| `amodal/tools/seed_examples/`                         | The seeding tool behind the `seed` trigger (offline shortcut).                                                                 |
| `amodal/tools/claims-stats/`                          | The custom tool: deterministic claims arithmetic the reviewer calls mid-reasoning. Numbers, never verdicts.                    |
| `evals/`                                              | The eval suite from step 4, grown with each step; `whatif-inspection-received` covers the new dispatch path. Re-run it before promoting. |
| `amodal/tools/sync_submissions/`                      | Durable invoke-lane tool for **Sync inbox**: the Gmail read-only surface (`read_messages` + offline fallback).                 |
| `amodal/tools/send_outcome/`                          | Durable invoke-lane tool for **Send reply**: the Gmail confirm surface (`send_message`), operator-gated.                       |
| `amodal/_lib/underwriting-analysis.ts`                | The shared triage behind the composite tool: both entry points run it, so they can't drift.                                    |
| `amodal/_types/`                                      | Vendored runtime types (`CustomToolContext` / `ToolDefinition`, `AgentDefinition` / `AgentSurfaceContext`), kept local so the example typechecks offline. |
| `amodal/knowledge/underwriting-guide.md`              | The fictional underwriting guide the reviewer reasons over (passed to it as input).                                            |
| `amodal/stores/`                                      | 4 store schemas: `submissions` (now with `broker_email` + reply state), `documents`, `claims`, `risk_findings`.                |
| `amodal/_lib/examples.ts` / `demo-data.ts`            | The demo dataset and the code that hydrates it into the stores.                                                                |
| `hooks/ready-to-quote-guard/`                         | `preToolUse` guard enforcing the missing-docs rule for every writer.                                                           |
| `hooks/outbound-reply-guard/`                         | `preToolUse` guard on `send_message`: no reply before a triage, and no reply from an automation/webhook run (nobody to confirm). |
| `src/`                                                | The custom React UI (Vite): one screen, `useStoreQuery` + `useToolRun` (Sync/Send) + the chat-trigger Analyze button, the Send-reply confirm modal, the `useAutomation()` Auto-sync toggle. |
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
5. In the cloud, flip **Auto-sync daily** on. The binding it creates runs
   `sync_submissions` once a day with no UI open; new broker mail is already
   filed when the operator arrives. The binding is visible (and can be paused)
   in the platform's Automations page as well as through the toggle.
6. Tell the chat something meant to last: `We're not writing vacant buildings
   this quarter — remember that.` The agent saves one memory entry. Open a
   fresh chat session and ask `what's our current appetite guidance?`: the
   entry is back in the prompt, across sessions, without a store row. Ask it
   to forget and the entry is removed (`editableBy: "any"`).

- `sub_bistro_ember` · `sub_cascade_printworks` · `sub_summit_yoga` · `sub_northstar_storage` · `sub_vacant_millworks`

See the surface change with the caller. The same deployed agent holds
`seed_examples` and the reviewer dispatch when an operator chats, and neither
when a scheduled binding runs it: both entries in
`agents/default/agent.ts` are conditional on `ctx.humanPresent`, which the
platform sets from how the run was triggered. Delete a `conditional` and the
entry becomes unconditional; delete the entry and no caller ever holds it —
the file is the ceiling. (Step 10's version of the same lesson, one layer
down: schedule `send_outcome` as an automation target and watch
`outbound-reply-guard` block the send because the verified trigger source is
an automation.)

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
  `runtimeApp`. The chat surface itself is `agents/default/` (`agent.json` +
  `agent.ts` scope the session's tools, stores, and dispatchable `subagents`;
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
  `outbound-reply-guard` (which send tool it gates; it also blocks any send
  whose verified trigger source is an automation or webhook).
- `evals/*.md`: the eval suite, grown step by step; `whatif-inspection-received.md`
  pins the dispatch path. Re-run it after any edit here.
- `amodal.json` `memory`: enabled, `editableBy: "any"`, `maxEntries: 50`.
  Memory holds the desk's standing guidance; triage state stays in the stores,
  so each triage remains a pure function of what is in them.
- `agents/default/agent.ts`: the conditional surface. Edit the predicates to
  change which callers hold `seed_examples` and the reviewer dispatch; the
  entries written there are the ceiling, and a predicate can only subtract.
