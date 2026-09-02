# Underwriting Review Example

An agent that triages commercial insurance submissions against an underwriting
guide: one knowledge file, five stores, a reviewer subagent, an eval suite, a
custom React UI with a screen for the underwriter and a screen for the broker, guardrail hooks, and now a Gmail connection
whose read-only surface syncs submissions in and whose confirm-gated surface
emails outcomes back. It runs on the Amodal runtime, and the UI is a small
React app the runtime serves for you.

Each submission is scored against a fictional carrier's underwriting guide, and the
agent returns a recommendation (`ready-to-quote`, `quote-with-conditions`,
`request-info`, `refer`, or `decline`), saves it, and, on the operator's
confirmation, emails it back to the broker.

This is **step 7** of a guided, incremental series. See
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
  `diff -r steps/06-guardrail-hooks steps/07-gmail-connection`.

**You are here: `steps/07-gmail-connection`.** This README describes the app
at this step.

| Step                           | What you learn                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `steps/01-skills-and-knowledge`| The runtime loop and context compiler, and the core primitives: skills and knowledge                               |
| `steps/02-stores`              | Stores, the CRUD tools Amodal generates, and an append-only trail beside the row tables                                  |
| `steps/03-code-vs-llm`         | Splitting work between code and the LLM: deterministic logic in a custom tool vs. judgment in a reviewer subagent  |
| `steps/04-evals`               | Evals as quality gates: pin the reviewer's judgment down before you build surfaces on top of it                    |
| `steps/05-custom-ui`           | Going beyond hosted chat: a custom UI with `runtimeApp`, roles and routes, and tools the model cannot call                           |
| `steps/06-guardrail-hooks`     | Guardrail hooks: one hard rule, enforced at the platform layer for every writer                                    |
| `steps/07-gmail-connection`    | Connecting to an external service, the surfaces it exposes, and read-only vs. confirm policies                     |
| repo root (step 8)             | Writing a custom tool the reviewer itself calls, when a prompt and a schema aren't enough                          |

## The one idea this step teaches: connecting to an external service

Steps 1–6 were self-contained: every submission lived in the demo's own stores,
put there by `seed_examples`. Step 7 reaches an external service, the broker
mailbox, through a connection, and shows that the surfaces a connection exposes
don't all carry the same risk.

What a connection is. A driver package named in `amodal.json#packages`, bound
to the agent by a local spec under
[`amodal/connections/gmail/`](amodal/connections/gmail/) (matched on
`protocol`). Once loaded it registers tools you call with `ctx.callTool(...)`,
here `read_messages` and `send_message`. The load is non-fatal: with no
`GMAIL_ACCESS_TOKEN` the agent still boots and the demo still runs (see
[Running it](#running-it)).

Read-only surface (`read_messages`). Reading the inbox has no outside side
effect, so a tool may call it freely, with no confirmation.
[`sync_submissions`](amodal/tools/sync_submissions/handler.ts) (the **Sync
inbox** button) reads the broker mail and files each submission into the
`submissions` / `documents` stores. When no mailbox is connected it falls back to
a _simulated_ inbound built from the demo dataset (exactly as a real deployment
falls back from a live pull to a simulated one), so the screen always populates.

Confirm surface (`send_message`). Emailing a real broker is irreversible, so
it must be operator-confirmed, never automatic.
[`send_outcome`](amodal/tools/send_outcome/handler.ts) (the **Send reply**
button) composes the decision email and sends it, but only after the operator
reviews the exact message in a modal and confirms.

The gate, enforced platform-wide. The confirm lives in the UI, but the
`send_message` tool exists for the whole agent, and a future tool (or the chat
agent) could call it. As in step 6, a hook makes the policy true everywhere:
[`outbound-reply-guard`](hooks/outbound-reply-guard/index.mjs) fires on any
`send_message`, resolves the recipient to a submission by `broker_email`, and
blocks the send if that submission has no saved finding: no reply before a
decision, whoever tries.

See the diff: `diff -r steps/06-guardrail-hooks steps/07-gmail-connection`.

## How it works

The agent still has two triggered custom tools: a message that matches the
pattern fires the handler directly, no LLM round trip:

- send **`seed`** → [`seed_examples`](amodal/tools/seed_examples/handler.ts)
  loads the demo submissions, their documents, and their claims into the stores.
  The UI runs the same tool over the invoke lane (`useToolRun`) the first time
  it opens on an empty store, and **Reset demo data** runs `reset_demo` the
  same way to empty the stores and load the demo again.
- send **`analyze sub_bistro_ember`** (or `triage` / `review` / `assess` + an id)
  → [`analyze_submission`](amodal/tools/analyze_submission/handler.ts) runs the
  triage and reports in chat. The **Analyze** button fires the same command
  through the chat surface.

And it adds two **durable invoke tools** that no chat message triggers and no
agent lists, so the model cannot call them. They run only when the UI fires
them (`useToolRun`, the direct-invoke lane; `"triggers": [{ "kind": "invoke" }]`
in `tool.json`):

- **Reset demo data** → the [`reset_demo`](amodal/tools/reset_demo/tool.json)
  tool, behind a confirm modal: it removes every row in the five stores and
  loads the demo dataset again.
- the **Sync inbox** button →
  [`sync_submissions`](amodal/tools/sync_submissions/handler.ts) (Gmail
  read-only surface): reads the broker mail and files submissions into the
  stores. Falls back to the demo dataset when no mailbox is connected.
- the **Send reply** button →
  [`send_outcome`](amodal/tools/send_outcome/handler.ts) (Gmail confirm
  surface): emails the decision back to the broker, only after the operator
  confirms the exact message. `execution: "durable"` journals each side effect,
  so a retry replays the record instead of re-sending the mail.

The `analyze` path runs the same four-stage loop as before, in the shared
[`runUnderwritingAnalysis`](amodal/_lib/underwriting-analysis.ts):

1. **load**: reads the submission, its `documents`, and its `claims` from the
   stores via the auto-generated `store__*__get` / `store__*__query` tools.
2. **check (in code)**: computes the completeness check deterministically in
   TypeScript: any `required` document whose status isn't `received` is missing,
   full stop. A rule, not a judgment, so code decides it and hands the reviewer
   the result as fact.
3. **review (in the subagent)**: the
   [`underwriting-reviewer`](agents/underwriting-reviewer/AGENT.md) subagent
   reads the [underwriting guide](amodal/knowledge/underwriting-guide.md)
   (passed in as input) and makes the judgment a formula can't (eligibility,
   hazards, claims severity, one recommendation).
4. **record**: code holds the floor on the way out: it folds the deterministic
   missing-docs list into the finding and won't let a packet with missing
   required docs be `ready-to-quote`. Then it writes a `risk_findings` row,
   stamps the submission, and returns the result. The `ready-to-quote-guard`
   hook backstops that last rule for every writer.

Once a submission has a finding, **Send reply** runs `send_outcome`: it loads the
submission + its finding, composes the broker email, and calls `send_message`.
The `outbound-reply-guard` hook blocks that send if the submission was never
triaged: the confirm policy, made true for every caller.

How do submissions arrive? The first time the screen opens on an empty
store, the UI runs `seed_examples` over the invoke lane and the four demo
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

| Path                                                  | What it is                                                                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `amodal.json`                                         | Manifest: name, version, memory off, the `gmail` package, and `runtimeApp: { custom: true }`.                    |
| `amodal/connections/gmail/`                           | The Gmail connection: `spec.json` (bound by `protocol`, env-based token) + README. Read + confirm surfaces.      |
| `evals/`                                              | The eval suite from step 4, unchanged. Re-run it before promoting. `never-decides` and `submission-history` cover the boundary the UI depends on. |
| `agents/default/`                                     | The chat agent: its prompt (`AGENT.md`) and its tools + store access (`agent.json`).                             |
| `agents/underwriting-reviewer/`                       | The scoped subagent that holds the underwriting judgment.                                                        |
| `amodal/tools/sync_submissions/`                      | Durable invoke tool for **Sync inbox**: the Gmail read-only surface (`read_messages` + offline fallback).        |
| `amodal/tools/send_outcome/`                          | Durable invoke tool for **Send reply**: the Gmail confirm surface (`send_message`), operator-gated.              |
| `amodal/tools/seed_examples/`                         | The durable seeding tool: the UI runs it over the invoke lane on first open, the `seed` regex trigger runs it from chat. |
| `amodal/tools/reset_demo/`                            | Durable invoke-lane tool for **Reset demo data**: lists and removes every row in the five stores, then seeds blind. |
| `amodal/tools/analyze_submission/`                    | The triggered composite tool (load → check in code → call the reviewer → record).                                |
| `amodal/tools/decide_submission/`                     | The human decision, invoke-only and in no agent's tools: the model cannot call it.             |
| `amodal/tools/submit_submission/`                     | The broker's filing, invoke-only: writes the packet and reviews it in one durable run.         |
| `amodal/_lib/underwriting-analysis.ts`                | The shared triage flow every surface runs, so they can't drift.                                                  |
| `amodal/_lib/reset.ts`                                | `resetDemo`: the remove-then-seed sequence behind `reset_demo`.                                |
| `amodal/_lib/decision.ts`                             | The decision rules, imported by both the handler and the modal so they cannot disagree.        |
| `amodal/_lib/submit.ts`                               | `submitSubmission`: file the packet, record the event, review what the run already holds.      |
| `amodal/_lib/events.ts`                               | `appendEvent`: the single writer for the `events` trail.                                       |
| `amodal/_types/tool-context.ts`                       | Local stub of the runtime's custom-tool context types, so the example typechecks offline.                        |
| `amodal/knowledge/underwriting-guide.md`              | The fictional underwriting guide the reviewer reasons over.                                                      |
| `amodal/stores/`                                      | 5 store schemas: `submissions` (with `broker_email`, reply state, and the human decision), `documents`, `claims`, `risk_findings`, `events`. All `deletable`, which registers the `__remove` tools the reset uses. |
| `amodal/_lib/examples.ts` / `demo-data.ts`            | The demo dataset and the code that hydrates it into the stores.                                                  |
| `hooks/ready-to-quote-guard/`                         | `preToolUse` guard enforcing the missing-docs rule for every writer.                                             |
| `hooks/outbound-reply-guard/`                         | `preToolUse` guard on `send_message`: no reply before a submission is triaged.                                   |
| `src/`                                                | The custom React UI (Vite): `App.tsx` is the shell (data, role, route), with `screens/` and `components/` beside it. `routes.ts` holds the hash routes and which role owns which, `persona.ts` the role switch, `serial.ts` the one-at-a-time analysis queue. |
| `.env.example`                                        | The Gmail env vars (all optional, unset runs offline).                                                           |
| `index.html` · `vite.config.ts` · `tsconfig.app.json` | SPA entry + build config.                                                                                        |

## Example cases

The four submissions shipped in `examples.ts`:

| Submission                | Why                                                         | Expected recommendation  |
| ------------------------- | ----------------------------------------------------------- | ------------------------ |
| Bistro Ember LLC          | Missing kitchen fire-safety inspection + prior kitchen fire | `request-info` / `refer` |
| Summit Yoga Studio        | Complete packet, no claims, eligible                        | `ready-to-quote`         |
| Northstar Storage         | 22-yr roof, hail region, clean claims                       | `quote-with-conditions`  |
| Vacant Millworks Building | Vacant, ineligible                                          | `decline`                |

## Running it

Deploy the app to Amodal. The runtime serves the custom UI on the agent's domain
and the agent chat alongside it. It runs with no credentials: the Gmail
connection loads non-fatally, so every step works offline:

1. Open the app. The four demo submissions
   load into the stores on first open. With `GMAIL_ACCESS_TOKEN` set,
   **Sync inbox** reads the real broker inbox. **Reset demo data** puts the
   stores back to the demo dataset.
2. Click **Analyze** on a row to triage it: the saved recommendation, risk score,
   and missing-info list appear inline. (You can still triage from chat with
   `analyze <id>`. Both run the same logic.)
3. Click **Send reply** to email the outcome back to the broker. Review the exact
   message in the modal and **Confirm**. That operator confirmation is the gate
   on the write surface. Offline, the send is captured by the dev outbox
   (`GMAIL_DEV_OUTBOX`). With `GMAIL_FROM_ADDRESS` set it goes out over Gmail.

- `sub_bistro_ember` · `sub_summit_yoga` · `sub_northstar_storage` · `sub_vacant_millworks`

To talk to a real mailbox, copy `.env.example` to `.env` and set
`GMAIL_ACCESS_TOKEN` (+ `GMAIL_FROM_ADDRESS` to send). See
[`amodal/connections/gmail/README.md`](amodal/connections/gmail/README.md).

### Developing the UI locally

```sh
npm install
npm run dev        # Vite dev server; talks to a runtime at VITE_RUNTIME_URL (default http://localhost:3001)
npm run build      # production build → dist/ (what the cloud build uploads)
npm run typecheck  # typechecks both the runtime tools (amodal/) and the SPA (src/)
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
- `agents/default/agent.json`: the chat agent's tools and store access. The
  invoke tools are deliberately in no agent's tools list.
- `amodal.json` manifest: name, version, the `gmail` package, `runtimeApp`,
  memory off.
- `hooks/*/hook.json`: the guards' config: `ready-to-quote-guard` (which write
  tools it gates, which recommendation it blocks on missing docs) and
  `outbound-reply-guard` (which send tool it gates).
- `evals/*.md`: the eval suite from step 4, unchanged. Re-run it after any
  edit here.
- `amodal.json` sets `memory.enabled: false`. Durable state lives in
  the stores, so each triage is a pure function of what is in them and there is
  nothing to carry across sessions in conversation memory.
