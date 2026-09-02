# Underwriting Review Example

An agent that triages commercial insurance submissions against an underwriting
guide: one knowledge file, five stores, four custom tools, a reviewer subagent,
an eval suite, and a custom React UI with a screen for the underwriter and a
screen for the broker. It runs on the Amodal runtime, and the UI is a small
React app the runtime serves for you.

Each submission is scored against a fictional carrier's underwriting guide, and the
agent returns a recommendation (`ready-to-quote`, `quote-with-conditions`,
`request-info`, `refer`, or `decline`) and saves it.

This is **step 5** of a guided, incremental series. See
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
  `diff -r steps/04-evals steps/05-custom-ui`.

**You are here: `steps/05-custom-ui`.** This README describes the app at this
step.

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

## The one idea this step teaches: going beyond hosted chat

Steps 1–4 lived entirely in hosted chat: you typed to the agent, and by step 3
an `analyze sub_…` message fired a triggered tool. Step 5 stands up the
operator's own front end, and with it the two pieces that take an agent past
chat:

1. A custom UI (`runtimeApp`). Setting `"runtimeApp": { "custom": true }` in
`amodal.json` tells the runtime to build the React app in `src/` and serve it on
the agent's own domain instead of the hosted chat. The screen reads the stores
directly with `useStoreQuery` (no chat round-trip) and calls `refetch()` after
an action to pull in the new rows.

2. An action fired from the UI. The **Analyze** button sends the same
`analyze <id>` command through the chat surface (`RuntimeClient.chatStream`),
where it matches the regex **trigger** on the `analyze_submission` tool. The
triage runs deterministically from the request path and is saved to the
stores by the time the tool's result event arrives; the UI stops listening
there and refetches, ignoring the narration turn. One tool, one code path,
two surfaces, so they can't drift.

3. Things chat cannot do at all. A custom UI can model a role the runtime never
gives it, deep-link to one record, fan a single click out over the whole desk,
and hold a tool the model is not allowed to touch:

   - **Roles.** The rail switches between the underwriter and the broker, and
     each role has its own tabs, its own home, and its own reading of the same
     row. The underwriter sees the recommendation and the risk score; the
     broker sees "Under review" or "Information needed". This is presentation,
     not authorization: the runtime gives the custom UI no user identity, and
     both roles talk to the same agent. What is actually enforced is the tools
     list, below.
   - **Deep links.** `#/submission/<id>` is a URL either role can open, so a
     submission is something you can send someone.
   - **One click over the whole desk.** **Analyze all** pushes every
     un-analysed submission through a serial queue, and the same queue triages
     the desk once after the first load, so the demo arrives already triaged.
     The queue is serial because each analysis runs the reviewer subagent:
     firing a desk at once opens one model call per row.
   - **A tool the model cannot reach.** `decide_submission` and
     `submit_submission` are in no agent's `tools` list and have no regex
     trigger, so the only caller is the invoke lane behind a UI action. The
     agent recommends; a person decides and a person files. That is structural,
     not a prompt asking the model to hold back. `reset_demo` was the first
     tool shaped this way; these two are the ones that matter.

   The rules a decision has to satisfy live in
   [`amodal/_lib/decision.ts`](amodal/_lib/decision.ts), which the decide modal
   and the handler both import, so a disabled button and a refused run always
   say the same thing.

Note what this step deliberately leaves open: there are now two callers,
the chat agent and the UI, and the hard rule from step 3
(_missing required docs can never be `ready-to-quote`_) is still only enforced
inside the analyze and decide code paths. Any other writer could regress it.
Making that rule true for every caller is the one idea of step 6.

See the diff: `diff -r steps/04-evals steps/05-custom-ui`.

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
  triage and reports in chat.

The **Analyze** button on the pipeline fires the same `analyze <id>` command
through the chat surface, so both surfaces run the identical path. **Decide**
and the broker's **File submission** do not go through chat: they invoke
`decide_submission` and `submit_submission` directly, because no agent may.

`submit_submission` files the packet and reviews it in the same durable run, so
the broker gets an outcome rather than a receipt. A durable run cannot read back
its own uncommitted writes, so the review works from the rows the run holds in
memory.

Both entry points run the same four-stage loop, in the shared
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
   stamps the submission, and returns the result: reported in chat, and picked
   up by a `useStoreQuery` refetch in the UI.

What happens on fresh stores? Same as step 3: `analyze` self-seeds. A run
doesn't see its own uncommitted store writes, so on a missing demo id the
shared triage seeds the stores for later runs and analyzes the in-memory
example directly in this run. Explicit seeding is a UI action too: the
screen runs `seed_examples` through the invoke lane (`useToolRun`) the first
time it opens on an empty store, and **Reset demo data** runs `reset_demo`
the same way.

And the evals? Unchanged from step 4, and that's the point: the UI is a new
surface over the same logic, so the suite that pins the judgment still passes.
Re-run it after deploying to prove the new surface changed nothing.

## What's in here

| Path                                                  | What it is                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `amodal.json`                                         | Manifest: name, version, memory off, and `runtimeApp: { custom: true }`.                       |
| `evals/`                                              | The eval suite, including `never-decides.md` and `submission-history.md`: the agent must refuse to decide and must answer history from the trail. |
| `agents/default/`                                     | The chat agent: its prompt (`AGENT.md`) and its tools + store access (`agent.json`).           |
| `agents/underwriting-reviewer/`                       | The scoped subagent that holds the underwriting judgment.                                      |
| `amodal/tools/seed_examples/`                         | The durable seeding tool: the UI runs it over the invoke lane on first open, the `seed` regex trigger runs it from chat. |
| `amodal/tools/reset_demo/`                            | Durable invoke-lane tool for **Reset demo data**: lists and removes every row in the five stores, then seeds blind. |
| `amodal/tools/analyze_submission/`                    | The triggered composite tool (load → check in code → call the reviewer → record).              |
| `amodal/tools/decide_submission/`                     | The human decision, invoke-only and in no agent's tools: the model cannot call it.             |
| `amodal/tools/submit_submission/`                     | The broker's filing, invoke-only: writes the packet and reviews it in one durable run.         |
| `amodal/_lib/underwriting-analysis.ts`                | The shared triage flow every surface runs, so they can't drift.                                |
| `amodal/_lib/reset.ts`                                | `resetDemo`: the remove-then-seed sequence behind `reset_demo`.                                |
| `amodal/_lib/decision.ts`                             | The decision rules, imported by both the handler and the modal so they cannot disagree.        |
| `amodal/_lib/submit.ts`                               | `submitSubmission`: file the packet, record the event, review what the run already holds.      |
| `amodal/_lib/events.ts`                               | `appendEvent`: the single writer for the `events` trail.                                       |
| `amodal/_types/tool-context.ts`                       | Local stub of the runtime's custom-tool context types, so the example typechecks offline.      |
| `amodal/knowledge/underwriting-guide.md`              | The fictional underwriting guide the reviewer reasons over.                                    |
| `amodal/stores/`                                      | 5 store schemas: `submissions`, `documents`, `claims`, `risk_findings`, `events`. All `deletable`, which registers the `__remove` tools the reset uses. |
| `amodal/_lib/examples.ts` / `demo-data.ts`            | The demo dataset and the code that hydrates it into the stores.                                |
| `src/`                                                | The custom React UI (Vite): `App.tsx` is the shell (data, role, route), with `screens/` and `components/` beside it. `routes.ts` holds the hash routes and which role owns which, `persona.ts` the role switch, `serial.ts` the one-at-a-time analysis queue. |
| `index.html` · `vite.config.ts` · `tsconfig.app.json` | SPA entry + build config.                                                                      |

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
and the agent chat alongside it.

1. Open the app. The demo submissions load into the stores on first open and
   the desk triages itself, row by row. **Reset demo data** puts it back.
2. On **Pipeline**, click an applicant to open the submission, or **Decide** to
   record your call. A decline needs a note, and so does a quote the agent did
   not recommend; a quote is refused outright while required information is
   outstanding.
3. **History** is the events trail for the whole desk; each submission's detail
   screen shows its own slice of it. **Guide** renders the same underwriting
   guide file the reviewer subagent is given.
4. Switch **Acting as** to the broker. File a submission and it comes back
   reviewed in one run. Where the underwriter left a request for information,
   the broker sees what is missing and can resubmit; the id stays and the
   revision goes up.
5. You can still triage from chat with `analyze <id>`. Deciding and filing are
   not available there, by construction.

- `sub_bistro_ember` · `sub_summit_yoga` · `sub_northstar_storage` · `sub_vacant_millworks`

### Developing the UI locally

```sh
npm install
npm run dev        # Vite dev server; talks to a runtime at VITE_RUNTIME_URL (default http://localhost:3001)
npm run build      # production build → dist/ (what the cloud build uploads)
npm run typecheck  # typechecks both the runtime tools (amodal/) and the SPA (src/)
```

## Configuration

- `amodal/_lib/examples.ts`: the demo submissions the UI loads on first open
  (and `seed` and **Reset demo data**). Edit it and redeploy to change the
  dataset; click **Reset demo data** to see the edit. Each entry is
  self-contained, with embedded `docs[]` and `claims[]`.
- `evals/*.md`: the eval suite from step 4, unchanged. Re-run it after any edit
  here.
- `agents/default/agent.json`: the chat agent's tools and store access.
- `amodal.json` manifest: name, version, `runtimeApp`, memory off. No
  third-party connectors required.
- `amodal.json` sets `memory.enabled: false`. Durable state lives in
  the stores, so each triage is a pure function of what is in them and there is
  nothing to carry across sessions in conversation memory.
