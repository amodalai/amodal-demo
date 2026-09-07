# Underwriting Review Example

An agent that triages commercial insurance submissions against an underwriting
guide: a reviewer subagent, one knowledge file, five stores, an eval suite, a
custom UI with a screen for the underwriter and a screen for the broker, a Gmail connection whose read-only surface syncs
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
is a self-contained snapshot under `steps/`; **the repo root is always the
current step**. Two ways to use it:

- Open a step folder to see the whole app frozen at that stage: read its
  `README.md`, deploy it as-is.
- Diff two adjacent steps to see precisely what that one concept changed:
  `diff -r steps/07-gmail-connection steps/08-custom-tool`.

**You are here: `steps/08-custom-tool`.** This README describes the app at
this step.

| Step | What you learn |
| --- | --- |
| [01: skills-and-knowledge](../01-skills-and-knowledge/) | Skills, knowledge, and the runtime loop |
| [02: stores](../02-stores/) | Stores and an append-only event trail |
| [03: code-vs-llm](../03-code-vs-llm/) | Deterministic code and reviewer judgment |
| [04: evals](../04-evals/) | Evals for underwriting behavior |
| [05: custom-ui](../05-custom-ui/) | Custom UI, roles, and routes |
| [06: guardrail-hooks](../06-guardrail-hooks/) | Guard hooks for hard rules |
| [07: gmail-connection](../07-gmail-connection/) | Gmail policies and native OpenAPI weather discovery |
| [08: custom-tool](../08-custom-tool/) | Custom tools for claims arithmetic |
| [09: model-delegation](../09-model-delegation/) | Model-initiated delegation |
| [10: automations](../10-automations/) | Background automations |
| [11: memory-and-surfaces](../11-memory-and-surfaces/) | Memory and conditional surfaces |
| [12: embedding and multi-tenancy](../../README.md) | Scoped desks, sessions, and memory |

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

See the diff: `diff -r steps/07-gmail-connection steps/08-custom-tool`.

## Live weather alerts through OpenAPI

Open an applicant as the underwriter and click **Check weather alerts**.
Northstar Storage is a useful example: its Texas submission gives the
lookup a state without needing an address or geocoding service. The panel
reports current alert types, severity, affected areas, and expiry times,
with a source link and the time of the check. No account or API key is
required. A state can have no active alerts; an unavailable service is
shown as a failed check.

The [`weather` agent](agents/weather/AGENT.md) holds only the
[NWS connection](amodal/connections/weather/README.md). The UI sends a
chat request to that agent. It discovers the operation from the checked-in
OpenAPI contract, calls the generated tool, and reads paged results when
the response is large. The panel accepts a report only after a successful
native alert call. The agent has no store grants or decision tools.
The `weather-alerts` eval checks discovery and source-grounded reporting;
`weather-read-only` checks that this surface refuses decision and email
requests. The live eval needs an available NWS service.

This teaches a second way to connect: Gmail uses an installed driver;
weather uses an API contract and the runtime's native discovery. The
explicit `openapi.source` block in `spec.json` enables it. Placing an
`openapi.json` file in a connection directory alone does not.

Statewide alerts are context for the operator. They do not establish that
a particular property is affected, measure long-term exposure, or change
the saved assessment. The feature requires a Cloud runtime with native
OpenAPI discovery support and internet access to NWS.

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
   required docs be `ready-to-quote`. If code overrides the recommendation, the
   saved summary explains why. Then it writes a `risk_findings` row,
   stamps the submission, and reports: the model summarizes the tool result in
   chat, and the UI refetches its `useStoreQuery` data. The
   `ready-to-quote-guard` hook backstops that last rule for every writer.

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
| `agents/default/`                                     | The chat agent (`agent.json` + `AGENT.md`): the implicit default surface; its config scopes the session's tools and stores.    |
| `agents/underwriting-reviewer/`                       | The reviewer subagent that scores against the underwriting guide. Its `agent.json` grants `claims_stats`.                      |
| `amodal/connections/gmail/`                           | The Gmail connection: `spec.json` (bound by `protocol`, env-based token) + README. Read + confirm surfaces.                    |
| `amodal/tools/analyze_submission/`                    | The composite triage tool (`tool.json` + `handler.ts`): declares its `uses` (store tools + the reviewer) and the `analyze` regex trigger. |
| `amodal/tools/decide_submission/`                     | The human decision, invoke-only and in no agent's tools: the model cannot call it.             |
| `amodal/tools/submit_submission/`                     | The broker's filing, invoke-only: writes the packet and reviews it in one durable run.         |
| `amodal/tools/seed_examples/`                         | The durable seeding tool: the UI runs it over the invoke lane on first open, the `seed` regex trigger runs it from chat. |
| `amodal/tools/reset_demo/`                            | Durable invoke-lane tool for **Reset demo data**: lists and removes every row in the five stores, then seeds blind. |
| `amodal/tools/claims-stats/`                          | The custom tool: deterministic claims arithmetic the reviewer calls mid-reasoning. Numbers, never verdicts.                    |
| `evals/`                                              | The eval suite from step 4, plus `analyze-repeat-claims` and `analyze-claims-window` covering the new tool. Re-run it before promoting. `never-decides` and `submission-history` cover the boundary the UI depends on. |
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
| `hooks/outbound-reply-guard/`                         | `preToolUse` guard on `send_message`: no reply before a submission is triaged.                                                 |
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

The pipeline shows the agent's recommendation and summary separately from
what the underwriter decided. **Decide** leads the actions after analysis;
**Re-analyze** runs another review. Pending rows show **Queued for analysis**
or **Analyzing against the underwriting guide**, with active and waiting
counts above the table. These labels follow the analysis queue; they do not
report individual checks. The applicant page holds the full risk score,
assessment cards, missing information, and conditions.

## Running it

Deploy the app to Amodal. The runtime serves the custom UI on the agent's domain
and the agent chat alongside it. Gmail credentials are optional: without
them, inbox sync uses the demo dataset. Weather checks use the public NWS
service and need internet access:

1. Open the app. The five demo submissions
   load into the stores on first open. With `GMAIL_ACCESS_TOKEN` set,
   **Sync inbox** reads the real broker inbox. **Reset demo data** puts the
   stores back to the demo dataset.
2. Click **Analyze** on a row to triage it. The row shows whether it is queued
   or actively analyzing, then the saved recommendation and its explanation. Open the applicant for the risk score, missing information, and
   claims assessment. (Chat's `analyze <id>` enters through the same trigger.)
   The claims assessment makes the custom tool's result visible: the reviewer
   calls `claims_stats` and must cite its numbers, so the note reads like `1 of 3
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
`git checkout main -- steps/08-custom-tool/agents/underwriting-reviewer/agent.json`.

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
