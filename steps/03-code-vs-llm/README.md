# Underwriting Review Example

An agent that triages commercial insurance submissions against an underwriting
guide: one skill, one knowledge file, four stores, and now two intents, no
custom UI. It runs entirely on the Amodal runtime. You deploy it and use it from
the hosted chat.

Each submission is scored against a fictional carrier's underwriting guide, and the
agent returns a recommendation (`ready-to-quote`, `quote-with-conditions`,
`request-info`, `refer`, or `decline`) and saves it.

This is **step 3** of a guided, incremental series. See
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
  `git checkout step-2`, deploy it, read its `README`.
- Diff two adjacent tags to see precisely what that one concept changed:
  `git diff step-2..step-3`.

**You are here: `step-3`.** This README describes the app at this step.

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

## The one idea this step teaches: the intent (and the code-vs-LLM split)

In steps 1–2 the main agent did everything itself: it read the underwriting
guide, worked the stores, and reasoned to a recommendation. That's flexible, but
some of the work isn't a judgment call at all: _"which required documents are
missing?"_ has one correct answer, and you don't want the LLM to recount it (and
occasionally miscount) on every run.

Step 3 introduces the intent: a deterministic, code-defined handler that runs
when a message matches its regex, no LLM round trip to decide what to do. The
intent is where you put the parts that should be code, and it calls the skill
only for the parts that are genuinely judgment.

## How it works

This app now has two regex chat intents:

- send **`seed`** once → [`seed-examples`](amodal/intents/seed-examples/intent.ts)
  loads the demo submissions, their documents, and their claims into the stores.
- send **`analyze sub_bistro_ember`** (or `triage` / `review` / `assess` + an id)
  → [`analyze-submission`](amodal/intents/analyze-submission/intent.ts) runs the
  core loop, splitting the work between code and the LLM:

1. **load**: reads the submission, its `documents`, and its `claims` from the
   stores via the auto-generated `store__*__get` / `store__*__query` tools.
2. **check (in code)**: computes the completeness check deterministically in
   TypeScript: any `required` document whose status isn't `received` is missing,
   full stop. This is a rule, not a judgment, so the handler decides it (the
   same answer every time) and hands the result to the skill as fact.
3. **review (in the skill)**: the
   [`underwriting-review`](amodal/skills/underwriting-review/SKILL.md) skill reads the
   [underwriting guide](amodal/knowledge/underwriting-guide.md) and makes the judgment a
   formula can't (eligibility, hazards, claims severity, one recommendation). It's
   _told_ which required docs are missing rather than recounting them, and returns a
   typed result via its `emit_review` result tool so code can act on the fields.
4. **record**: code holds the floor on the way out: it folds the deterministic
   missing-docs list into the finding (the model can't drop one) and won't let a
   packet with missing required docs be `ready-to-quote`. Then it writes a
   `risk_findings` row, stamps the submission, and reports the result.

The code-vs-LLM split. The deterministic part (which required documents are
missing) lives in code, and the judgment part (eligibility and the
recommendation) lives in the skill. Code computes the facts and enforces the
hard rules, while the LLM reasons over clean inputs and can't quietly miscount or overlook a missing
document. See the marked block in
[`analyze-submission/intent.ts`](amodal/intents/analyze-submission/intent.ts).

What happens on fresh stores? `analyze` self-seeds, with a twist. A run
doesn't see its own uncommitted store writes, so `analyze` can't seed and then
re-read the store: its `get` would run before the seed committed. Instead,
when the id is a demo submission the store doesn't have yet, `analyze` seeds
the stores for later runs and analyzes the in-memory example directly in this
run. `seed` still works as an explicit load of everything at once. (Both are
idempotent, safe to resend.)

## What's in here

| Path                                 | What it is                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `amodal.json`                        | Manifest: the chat agent (`session_types`) + its two intents + four stores. |
| `amodal/intents/seed-examples/`      | Loads the demo data into the stores (run once by sending `seed`).           |
| `amodal/intents/analyze-submission/` | The core intent (load from stores → check in code → call skill → record).   |
| `amodal/skills/underwriting-review/` | The LLM skill that scores against the underwriting guide.                   |
| `amodal/knowledge/underwriting-guide.md` | The fictional underwriting guide the skill reasons over.                    |
| `amodal/stores/`                     | 4 store schemas: `submissions`, `documents`, `claims`, `risk_findings`.     |
| `amodal/_lib/examples.ts`            | The demo dataset: companies + docs + claims (edit + redeploy to change).    |
| `amodal/_lib/demo-data.ts`           | Hydrates `examples.ts` into the stores for `seed-examples` and the `analyze` fallback. |

## Example cases

The four submissions shipped in `examples.ts`:

| Submission                | Why                                                         | Expected recommendation  |
| ------------------------- | ----------------------------------------------------------- | ------------------------ |
| Bistro Ember LLC          | Missing kitchen fire-safety inspection + prior kitchen fire | `request-info` / `refer` |
| Summit Yoga Studio        | Complete packet, no claims, eligible                        | `ready-to-quote`         |
| Northstar Storage         | 22-yr roof, hail region, clean claims                       | `quote-with-conditions`  |
| Vacant Millworks Building | Vacant, ineligible                                          | `decline`                |

## Running it

Deploy the app to Amodal, then open its chat and:

1. send **`analyze sub_bistro_ember`** (or any of the four IDs) to triage one.
   On fresh stores it seeds the demo data itself; sending **`seed`** first
   also works and loads everything at once.

- `sub_bistro_ember` · `sub_summit_yoga` · `sub_northstar_storage` · `sub_vacant_millworks`

`analyze` reads the packet from the stores, scores it with the skill, writes a
`risk_findings` row, and stamps the submission, so the result persists and
can be re-read or re-analyzed. No custom UI, nothing to run locally.

## Configuration

- `amodal/_lib/examples.ts`: the demo submissions that `seed` loads. Edit it and
  redeploy to change the dataset. Each entry is self-contained, with embedded
  `docs[]` and `claims[]`.
- `amodal.json`: manifest: the chat agent (`session_types`), its intents, and
  the four stores. No third-party connectors required.
- `amodal.json` sets `memory.enabled: false`. Durable state lives in the stores, so each triage is a pure function of what is in them and there is nothing to carry across sessions in conversation memory.
