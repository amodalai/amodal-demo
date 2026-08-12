# Underwriting Review Example

An agent that triages commercial insurance submissions against an underwriting
guide: one skill, one knowledge file, three intents, four stores, an eval
suite, and now a custom single-screen UI. The agent logic runs on the
Amodal runtime, and the UI is a small React app the runtime serves for you.

Each submission is scored against a fictional carrier's underwriting guide, and the
agent returns a recommendation (`ready-to-quote`, `quote-with-conditions`,
`request-info`, `refer`, or `decline`) and saves it.

This is **step 5** of a guided, incremental series. See
[The demo in steps](#the-demo-in-steps) to jump to any stage.

> Fictional demo. The agent recommends a workflow status and conditions only.
> It does not bind coverage, calculate premium, or give regulatory/legal
> advice.

## The demo in steps

This repo isn't one finished app: it's a guided build. Each step is a git
tag that adds one concept on top of the step before it, so the demo
grows from "the simplest thing that runs" to "shipped in a product" one idea at a
time. Two ways to use it:

- Check out a tag to see the whole app frozen at that stage:
  `git checkout step-4`, deploy it, read its `README`.
- Diff two adjacent tags to see precisely what that one concept changed:
  `git diff step-4..step-5`.

**You are here: `step-5`.** This README describes the app at this step.

| Step                                                            | What you learn                                                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`step‑1`](https://github.com/amodalai/amodal-demo/tree/step-1) | The runtime loop and context compiler, and the core primitives: skills and knowledge                           |
| [`step‑2`](https://github.com/amodalai/amodal-demo/tree/step-2) | Stores, and the CRUD tools Amodal generates so an agent can read and persist data                              |
| [`step‑3`](https://github.com/amodalai/amodal-demo/tree/step-3) | Splitting work between code and the LLM: deterministic logic in an intent vs. judgment delegated to a skill    |
| [`step‑4`](https://github.com/amodalai/amodal-demo/tree/step-4) | Evals as quality gates: pin the skill's judgment down before you build surfaces on top of it                   |
| [`step‑5`](https://github.com/amodalai/amodal-demo/tree/step-5) | Going beyond hosted chat: a custom UI with `runtimeApp`, and `defineIntent`: replay intents fired from the UI  |
| [`step‑6`](https://github.com/amodalai/amodal-demo/tree/step-6) | Guardrail hooks: one hard rule, enforced at the platform layer for every writer                                |
| [`step‑7`](https://github.com/amodalai/amodal-demo/tree/step-7) | Connecting to an external service, the surfaces it exposes, and read-only vs. confirm policies                 |
| `step‑8` _(planned)_                                            | Writing a custom tool when a Markdown skill and a schema aren't enough                                         |
| `step‑9` _(planned)_                                            | Delegating a sub-task to a separate scoped agent in `agents/` when a single skill isn't the right unit of work |
| `step‑10` _(planned)_                                           | Background automations: scheduled and webhook runs that need no UI open                                        |
| `step‑11` _(planned)_                                           | Session types & memory: one deployed agent, different modes with different capabilities                        |
| `step‑12` _(planned)_                                           | Embedding & multi-tenancy: the agent in your own app, with your auth and a `scope_id` per tenant               |

## The one idea this step teaches: going beyond hosted chat

Steps 1–4 lived entirely in hosted chat: you typed to the agent, and by step 3
an `analyze sub_…` message ran a classic regex intent. Step 5 stands up the
operator's own front end, and with it the two pieces that take an agent past
chat:

1. A custom UI (`runtimeApp`). Setting `"runtimeApp": { "custom": true }` in
`amodal.json` tells the runtime to build the React app in `src/` and serve it on
the agent's own domain instead of the hosted chat. The screen reads the stores
directly with `useStoreQuery` (no chat round-trip) and calls `refetch()` after
an action to pull in the new rows.

2. An action fired from the UI. A chat message can only trigger a classic
intent that has a `regex`. The UI has no such message, so it runs an intent
imperatively instead: `useIntentRun('analyze-submission-action').run({
submission_id })`. That route runs only replay intents (`defineIntent`), so
the "Analyze" button is backed by
[`analyze-submission-action`](amodal/intents/analyze-submission-action/intent.ts),
a replay sibling of the chat intent. Both call the same
[`runUnderwritingAnalysis`](amodal/_lib/underwriting-analysis.ts), so the two surfaces
can't drift.

Note what this step deliberately leaves open: there are now two writers,
the chat agent and the UI's replay intent, and the hard rule from step 3
(_missing required docs can never be `ready-to-quote`_) is still only enforced
inside the analyze code path. Any other writer could regress it. Making that
rule true for every caller is the one idea of step 6.

See the diff: `git diff step-4..step-5`.

## How it works

The agent still has two regex chat intents: a message that matches the
pattern runs a handler directly, no LLM round trip:

- send **`seed`** once → [`seed-examples`](amodal/intents/seed-examples/intent.ts)
  loads the demo submissions, their documents, and their claims into the stores.
- send **`analyze sub_bistro_ember`** (or `triage` / `review` / `assess` + an id)
  → [`analyze-submission`](amodal/intents/analyze-submission/intent.ts) runs the
  triage and reports in chat.

And it adds one replay intent that does not match any chat message. It runs
only when the UI fires it:

- the **Analyze** button on the submissions screen →
  [`analyze-submission-action`](amodal/intents/analyze-submission-action/intent.ts).

Both `analyze` paths run the same four-stage Amodal loop, in the shared
[`runUnderwritingAnalysis`](amodal/_lib/underwriting-analysis.ts):

1. **load**: reads the submission, its `documents`, and its `claims` from the
   stores via the auto-generated `store__*__get` / `store__*__query` tools.
2. **check (in code)**: computes the completeness check deterministically in
   TypeScript: any `required` document whose status isn't `received` is missing,
   full stop. A rule, not a judgment, so code decides it and hands the skill the
   result as fact.
3. **review (in the skill)**: the
   [`underwriting-review`](amodal/skills/underwriting-review/SKILL.md) skill reads the
   [underwriting guide](amodal/knowledge/underwriting-guide.md) and makes the judgment a
   formula can't (eligibility, hazards, claims severity, one recommendation).
4. **record**: code holds the floor on the way out: it folds the deterministic
   missing-docs list into the finding and won't let a packet with missing
   required docs be `ready-to-quote`. Then it writes a `risk_findings` row,
   stamps the submission, and reports: `emitText` in chat, the session result +
   a `useStoreQuery` refetch in the UI.

What happens on fresh stores? Same as step 3: `analyze` self-seeds. A run
doesn't see its own uncommitted store writes, so on a missing demo id the
shared triage seeds the stores for later runs and analyzes the in-memory
example directly in this run. Explicit seeding stays a chat-only action: it's
a classic intent, so the UI can't run it: the empty screen tells the operator
to send `seed` in chat first.

And the evals? Unchanged from step 4, and that's the point: the UI is a new
surface over the same logic, so the suite that pins the judgment still passes.
Re-run it after deploying to prove the refactor to
`runUnderwritingAnalysis` changed nothing.

## What's in here

| Path                                                  | What it is                                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `amodal.json`                                         | Manifest: the chat agent (`session_types`), its intents, four stores, and `runtimeApp: { custom: true }`. |
| `evals/`                                              | The eval suite from step 4: still green, both analyze paths run the same logic.                           |
| `amodal/intents/seed-examples/`                       | Loads the demo data into the stores (run once by sending `seed`).                                         |
| `amodal/intents/analyze-submission/`                  | The classic regex chat intent (load → call skill → record).                                               |
| `amodal/intents/analyze-submission-action/`           | The replay (`defineIntent`) sibling the UI fires: same triage, run route.                                 |
| `amodal/_lib/underwriting-analysis.ts`                | The shared triage both intents call, so they can't drift.                                                 |
| `amodal/_types/replay-intent.ts`                      | Vendored `defineIntent` / replay-context types (kept local, like `intent.ts`).                            |
| `amodal/skills/underwriting-review/`                  | The LLM skill that scores against the underwriting guide.                                                 |
| `amodal/knowledge/underwriting-guide.md`              | The fictional underwriting guide the skill reasons over.                                                  |
| `amodal/stores/`                                      | 4 store schemas: `submissions`, `documents`, `claims`, `risk_findings`.                                   |
| `amodal/_lib/examples.ts` / `demo-data.ts`            | The demo dataset and the code that hydrates it into the stores.                                           |
| `src/`                                                | The custom React UI (Vite): one screen, `useStoreQuery` + `useIntentRun`.                                 |
| `index.html` · `vite.config.ts` · `tsconfig.app.json` | SPA entry + build config.                                                                                 |


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

1. Open the agent chat and send `seed` once to load the four demo
   submissions into the stores (or just send `analyze <id>`: it self-seeds on
   fresh stores).
2. Open the submissions screen (the custom UI). Click **Analyze** on a row
   to triage it: the saved recommendation, risk score, and missing-info list
   appear inline. (You can still triage from chat with `analyze <id>`. Both run
   the same logic.)


- `sub_bistro_ember` · `sub_summit_yoga` · `sub_northstar_storage` · `sub_vacant_millworks`

### Developing the UI locally

```sh
npm install
npm run dev        # Vite dev server; talks to a runtime at VITE_RUNTIME_URL (default http://localhost:3001)
npm run build      # production build → dist/ (what the cloud build uploads)
npm run typecheck  # typechecks both the runtime intents (amodal/) and the SPA (src/)
```

## Configuration

- `amodal/_lib/examples.ts`: the demo submissions that `seed` loads. Edit it and
  redeploy to change the dataset. Each entry is self-contained, with embedded
  `docs[]` and `claims[]`.
- `evals/*.md`: the eval suite from step 4, unchanged. Re-run it after any edit
  here.
- `amodal.json` manifest: the chat agent (`session_types`), its intents, the
  four stores, and `runtimeApp`. No third-party connectors required.
- `amodal.json` sets `memory.enabled: false`. Durable state lives in
  the stores, so each triage is a pure function of what is in them and there is
  nothing to carry across sessions in conversation memory.
