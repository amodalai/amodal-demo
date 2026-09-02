# Underwriting Review Example

An agent that triages commercial insurance submissions against an underwriting
guide: a reviewer subagent (code-called for the saved triage, model-dispatched
for what-if reviews), one knowledge file, five stores, an eval suite, a
custom UI with a screen for the underwriter and a screen for the broker, a Gmail connection whose read-only surface syncs
submissions in and whose confirm-gated surface emails outcomes back (with a
daily auto-sync automation that needs no UI open), guardrail
hooks, and two custom tools: a composite `analyze_submission` tool that runs
the deterministic triage around the subagent, and a pure `claims_stats` tool
the reviewer calls for the claims arithmetic. The agent logic runs on the
Amodal runtime, and the UI is a small React app the runtime serves for you.

Each submission is scored against a fictional carrier's underwriting guide, and the
agent returns a recommendation (`ready-to-quote`, `quote-with-conditions`,
`request-info`, `refer`, or `decline`), saves it, and, on the operator's
confirmation, emails it back to the broker.

This is **step 10** of a guided, incremental series. See
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
  `diff -r steps/09-model-delegation steps/10-automations`.

**You are here: `steps/10-automations`.** This README describes the app at
this step.

| Step                           | What you learn                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `steps/01-skills-and-knowledge`| The runtime loop and context compiler, and the core primitives: skills and knowledge                               |
| `steps/02-stores`              | Stores, the CRUD tools Amodal generates, and an append-only trail beside the row tables                                  |
| `steps/03-code-vs-llm`         | Splitting work between code and the LLM: deterministic logic in a custom tool vs. judgment in a reviewer subagent  |
| `steps/04-evals`               | Evals as quality gates: pin the reviewer's judgment down before you build surfaces on top of it                    |
| `steps/05-custom-ui`           | Going beyond hosted chat: a custom UI with `runtimeApp`, roles and routes, and tools the model cannot call                           |
| `steps/06-guardrail-hooks`     | Guardrail hooks: one hard rule, enforced at the platform layer for every writer                                    |
| `steps/07-gmail-connection`    | Connecting to an external service, the surfaces it exposes, and read-only vs. confirm policies                     |
| `steps/08-custom-tool`         | Writing a custom tool when a Markdown skill and a schema aren't enough                                             |
| `steps/09-model-delegation`    | Model-initiated delegation: the chat agent dispatching a subagent itself via `call_subagent`                       |
| `steps/10-automations`         | Background automations: scheduled runs that need no UI open, and the confirm gate with no human present            |
| repo root (step 11)            | Memory and conditional surfaces: one deployed agent whose capabilities vary per caller                             |

## The one idea this step teaches: background automations

Everything the app does so far starts with someone present: a chat message, a
button click, an operator confirming a modal. Step 10 makes one flow run with
nobody there, and then asks the question that raises: what does a confirm gate
mean when there is no one to confirm?

The gap. Broker mail arrives around the clock, but the inbox only syncs when
an operator clicks **Sync inbox**. The morning pipeline should already hold
last night's submissions. That is not a new tool: `sync_submissions` already
does the work. It is the same tool on a schedule.

What an automation is. A platform-managed **binding**: a target (an agent
prompt, a subagent, or a durable tool), a schedule (`cron`, a coarse `every`,
or a one-time `at`), and an enabled flag. The UI's **Auto-sync daily** toggle
creates one with the React SDK's `useAutomation()`:
`schedule('sync_submissions', { schedule: { every: '1d' } })` posts the
binding, and the platform's automation worker reconciles it into a scheduler
and fires the run through the same durable queue lane the buttons use. No UI
needs to be open; nothing is polled from the browser. Webhook-triggered
bindings are the same row with a webhook trigger in place of a schedule, for
runs an external event starts.

What to schedule, and what never to. `sync_submissions` is the right target
because everything about it already tolerates running unattended: it reads a
read-only surface, files idempotently, and falls back harmlessly offline.
`send_outcome` is the opposite: its consent is the operator reading the exact
message in the Send-reply modal, and a headless run has no modal. Nothing
stops a binding from *naming* `send_outcome` as its target, though, so the
rule "no confirmation, no send" cannot live in the UI.

So the policy moves to the platform layer, again. This is step 6's move,
repeated for a new caller class: the
[`outbound-reply-guard`](hooks/outbound-reply-guard/index.mjs) hook now blocks
`send_message` whenever the run's **verified** trigger source is an automation
or a webhook (`ctx.caller.source`, from the authenticated request, so a
request body can't spoof it). A scheduled run can sync, analyze, and stage all
it wants; the moment it tries to email a broker, the platform says no. The
confirm gate is no longer a property of the modal: it is a property of the
send.

See the diff: `diff -r steps/09-model-delegation steps/10-automations`.

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
  tool, behind a confirm modal: it removes every row in the five stores and
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
submissions land in the stores. Real mail comes through `sync_submissions` (the
read-only surface), fired by the **Sync inbox** button or, once **Auto-sync
daily** is on, by the scheduled binding with nobody watching: with a mailbox
connected it reads real broker mail; with none it confirms the demo is
already filed. **Reset demo data** empties the stores and seeds them
again, and the `seed` chat command (a regex trigger on the same tool,
idempotent) loads whatever is missing. Either way, a run doesn't see its own
uncommitted writes: `analyze` reads already-committed data from a prior seed
or sync, and on fresh stores it falls back to the in-memory demo examples
while seeding the stores for later runs.

The UI carries the rest of the workflow, and none of it runs through chat.
The rail switches between the underwriter and the broker: a screen role, not a
permission, since the runtime gives the custom UI no user identity. What is
enforced is that `decide_submission` and `submit_submission` are in no agent's
`tools` list and have no trigger, so the model cannot record a decision or file
paperwork whoever is looking. **Analyze all** pushes every un-analysed
submission through a serial queue, and the same queue triages the desk once
after the first load. **History** reads the `events` trail, each submission's
detail screen shows its own slice of it, and **Guide** renders the same
underwriting guide file the reviewer subagent is given.

## What's in here

| Path                                                  | What it is                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `amodal.json`                                         | Manifest: five stores, the `gmail` package, and `runtimeApp: { custom: true }`.                                                |
| `agents/default/`                                     | The chat agent (`agent.json` + `AGENT.md`): the implicit default surface; its config scopes the session's tools, stores, and now its dispatchable `subagents`. |
| `agents/underwriting-reviewer/`                       | The reviewer subagent that scores against the underwriting guide. Its `agent.json` grants `claims_stats` + `load_knowledge`.   |
| `amodal/connections/gmail/`                           | The Gmail connection: `spec.json` (bound by `protocol`, env-based token) + README. Read + confirm surfaces.                    |
| `amodal/tools/analyze_submission/`                    | The composite triage tool (`tool.json` + `handler.ts`): declares its `uses` (store tools + the reviewer) and the `analyze` regex trigger. |
| `amodal/tools/decide_submission/`                     | The human decision, invoke-only and in no agent's tools: the model cannot call it.             |
| `amodal/tools/submit_submission/`                     | The broker's filing, invoke-only: writes the packet and reviews it in one durable run.         |
| `amodal/tools/seed_examples/`                         | The durable seeding tool: the UI runs it over the invoke lane on first open, the `seed` regex trigger runs it from chat. |
| `amodal/tools/reset_demo/`                            | Durable invoke-lane tool for **Reset demo data**: lists and removes every row in the five stores, then seeds blind. |
| `amodal/tools/claims-stats/`                          | The custom tool: deterministic claims arithmetic the reviewer calls mid-reasoning. Numbers, never verdicts.                    |
| `evals/`                                              | The eval suite from step 4, grown with each step; `whatif-inspection-received` covers the new dispatch path. Re-run it before promoting. `never-decides` and `submission-history` cover the boundary the UI depends on. |
| `amodal/tools/sync_submissions/`                      | Durable invoke-lane tool for **Sync inbox**: the Gmail read-only surface (`read_messages` + offline fallback).                 |
| `amodal/tools/send_outcome/`                          | Durable invoke-lane tool for **Send reply**: the Gmail confirm surface (`send_message`), operator-gated.                       |
| `amodal/_lib/underwriting-analysis.ts`                | The shared triage behind the composite tool: both entry points run it, so they can't drift.                                    |
| `amodal/_lib/reset.ts`                                | `resetDemo`: the remove-then-seed sequence behind `reset_demo`.                                |
| `amodal/_lib/decision.ts`                             | The decision rules, imported by both the handler and the modal so they cannot disagree.        |
| `amodal/_lib/submit.ts`                               | `submitSubmission`: file the packet, record the event, review what the run already holds.      |
| `amodal/_lib/events.ts`                               | `appendEvent`: the one place this repo writes the `events` trail.                              |
| `amodal/_types/tool-context.ts`                       | Vendored custom-tool types (`CustomToolContext` / `ToolDefinition`), kept local so the example typechecks offline.             |
| `amodal/knowledge/underwriting-guide.md`              | The fictional underwriting guide the reviewer reasons over (passed to it as input).                                            |
| `amodal/stores/`                                      | 5 store schemas: `submissions` (with `broker_email`, reply state, and the human decision), `documents`, `claims`, `risk_findings`, `events`. All `deletable`, which registers the `__remove` tools the reset uses. |
| `amodal/_lib/examples.ts` / `demo-data.ts`            | The demo dataset and the code that hydrates it into the stores.                                                                |
| `hooks/ready-to-quote-guard/`                         | `preToolUse` guard enforcing the missing-docs rule for every writer.                                                           |
| `hooks/outbound-reply-guard/`                         | `preToolUse` guard on `send_message`: no reply before a triage, and no reply from an automation/webhook run (nobody to confirm). |
| `src/`                                                | The custom React UI (Vite): `App.tsx` is the shell (data, role, route), with `screens/` and `components/` beside it. `routes.ts` holds the hash routes and which role owns which, `persona.ts` the role switch, `serial.ts` the one-at-a-time analysis queue. |
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

1. Open the app. The five demo submissions
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
5. In the cloud, flip **Auto-sync daily** on. The binding it creates runs
   `sync_submissions` once a day with no UI open; new broker mail is already
   filed when the operator arrives. The binding is visible (and can be paused)
   in the platform's Automations page as well as through the toggle.

- `sub_bistro_ember` · `sub_cascade_printworks` · `sub_summit_yoga` · `sub_northstar_storage` · `sub_vacant_millworks`

See the gate hold, in one request. A binding will happily *name* the send tool
as its target; the platform hook is what stops it. Schedule
`{"target": {"kind": "tool", "ref": "send_outcome"}}` through
`POST /api/automations` (or `useAutomation().schedule('send_outcome', ...)`)
against a triaged submission and watch the run fail at the send:
`outbound-reply-guard` blocks `send_message` because the verified trigger
source is an automation, with no human present to confirm. The triage rule
from step 6 didn't help here (the submission WAS triaged); the caller rule is
what held. (Step 9's version of the same experiment: delete the `"subagents"`
line from `agents/default/agent.json` and the what-if dispatch disappears with
it.)

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
- `amodal.json` manifest: the five stores, the `gmail` package, and
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
  `outbound-reply-guard` (which send tool it gates; it also blocks any send
  whose verified trigger source is an automation or webhook).
- `evals/*.md`: the eval suite, grown step by step; `whatif-inspection-received.md`
  pins the dispatch path. Re-run it after any edit here.
- `amodal.json` sets `memory.enabled: false`. Durable state lives in
  the stores, so each triage is a pure function of what is in them and there is
  nothing to carry across sessions in conversation memory.
