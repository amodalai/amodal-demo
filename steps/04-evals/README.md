# Underwriting Review Example

An agent that triages commercial insurance submissions against an underwriting
guide: one skill, one knowledge file, two intents, four stores, and an eval
suite that gates changes to the judgment. Still no custom UI: you use it from
the hosted chat, and you run the evals before you promote a change.

Each submission is scored against a fictional carrier's underwriting guide, and the
agent returns a recommendation (`ready-to-quote`, `quote-with-conditions`,
`request-info`, `refer`, or `decline`) and saves it.

This is **step 4** of a guided, incremental series. See
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
  `git checkout step-3`, deploy it, read its `README`.
- Diff two adjacent tags to see precisely what that one concept changed:
  `git diff step-3..step-4`.

**You are here: `step-4`.** This README describes the app at this step.

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

## The one idea this step teaches: evals as quality gates

By step 3 the agent makes a judgment worth protecting: the same four
submissions should keep getting the same four recommendations after you edit
the skill, the underwriting guide, or the model. Nothing enforced that: you could
loosen the guide, deploy, and only find out from an operator that vacant
buildings started getting quotes. Step 4 adds evals: executable test cases
for the agent's behavior, run before you promote a change. The app's code
doesn't change at all in this step. What changes is that the judgment now has a
regression suite.

What an eval is. A Markdown file in [`evals/`](evals/). There is no
manifest wiring: the runtime discovers `evals/*.md` on its own. Each file has a `# Eval:` title,
an optional `## Setup` context note, a `## Query` (the user message to send),
and `## Assertions` about the response.

Evals run the production path. The query is sent through the same chat
pipeline as a real message, so `analyze sub_summit_yoga` fires the real
`analyze-submission` regex intent, which runs the real code, calls the real
skill, and writes a real finding. The suite tests the app you deploy, not a
mock of it.

Two kinds of assertions.

- **Deterministic**: a bare `key: value` line is checked in code, no judge:
  `contains: ready-to-quote` (response text), `tool_called:` /
  `tool_not_called:` (a named tool ran), `regex:`, `max_latency:`.
- **LLM-judged**: a line starting `- Should …` (or `- Should NOT …`) is
  evaluated by a separate judge model against the response: "Should give
  vacancy as the reason".

Use a deterministic line for anything with one right answer (the recommendation
string) and judged lines for the qualitative parts (the reasoning mentions the
roof). The same code-vs-LLM split as step 3, applied to testing.

The suite in this repo. One eval per demo submission (the clean quote, the
missing-document block, the conditional quote, the decline) plus a seed smoke
test and a safety eval that tries to get coverage bound and must keep failing
to. Each `analyze-*` eval is self-contained: on fresh stores the analyze
intent seeds the demo data itself, so the evals pass alone and in any order.

See the diff: `git diff step-3..step-4`.

## How it works

This app still has two regex chat intents:

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

The evals pin down the outcomes of that loop: each `analyze-*` eval sends the
real chat message and asserts on the recommendation the intent reports.

## What's in here

| Path                                 | What it is                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `amodal.json`                        | Manifest: the chat agent (`session_types`) + its two intents + four stores. |
| `evals/`                             | The eval suite: one per demo submission + seed smoke test + safety eval.    |
| `amodal/intents/seed-examples/`      | Loads the demo data into the stores (run once by sending `seed`).           |
| `amodal/intents/analyze-submission/` | The core intent (load from stores → check in code → call skill → record).   |
| `amodal/skills/underwriting-review/` | The LLM skill that scores against the underwriting guide.                   |
| `amodal/knowledge/underwriting-guide.md` | The fictional underwriting guide the skill reasons over.                    |
| `amodal/stores/`                     | 4 store schemas: `submissions`, `documents`, `claims`, `risk_findings`.     |
| `amodal/_lib/examples.ts`            | The demo dataset: companies + docs + claims (edit + redeploy to change).    |
| `amodal/_lib/demo-data.ts`           | Hydrates `examples.ts` into the stores for `seed-examples` and the `analyze` fallback. |

## Example cases

The four submissions shipped in `examples.ts`, each pinned by an eval:

| Submission                | Why                                                         | Expected recommendation  | Eval                         |
| ------------------------- | ----------------------------------------------------------- | ------------------------ | ---------------------------- |
| Bistro Ember LLC          | Missing kitchen fire-safety inspection + prior kitchen fire | `request-info` / `refer` | `analyze-missing-docs.md`    |
| Summit Yoga Studio        | Complete packet, no claims, eligible                        | `ready-to-quote`         | `analyze-eligible.md`        |
| Northstar Storage         | 22-yr roof, hail region, clean claims                       | `quote-with-conditions`  | `analyze-with-conditions.md` |
| Vacant Millworks Building | Vacant, ineligible                                          | `decline`                | `analyze-ineligible.md`      |

## Running it

Deploy the app to Amodal, then open its chat and:

1. send **`analyze sub_bistro_ember`** (or any of the four IDs) to triage one;
   on fresh stores it seeds the demo data itself (sending **`seed`** first
   also works);
2. open the agent's **Evals** page in Amodal and run the suite: six green
   checks.

Then see the gate work: edit
[`amodal/knowledge/underwriting-guide.md`](amodal/knowledge/underwriting-guide.md) and
delete the vacancy exclusion, redeploy, and re-run the suite.
`analyze-ineligible` fails (the guide change regressed a judgment you'd
promised) while the other five stay green, telling you exactly what broke.
Restore the rule and the suite is green again. That's the habit this step
installs: change the skill or the guide → run the evals → promote only on
green. (Evals can also run from the Platform API for CI.)

- `sub_bistro_ember` · `sub_summit_yoga` · `sub_northstar_storage` · `sub_vacant_millworks`

## Configuration

- `evals/*.md`: the eval suite. Add a case per behavior you want to pin;
  deterministic lines (`contains:`, `tool_called:`) for hard facts, `Should …`
  lines for the LLM judge.
- `amodal/_lib/examples.ts`: the demo submissions that `seed` loads. Edit it and
  redeploy to change the dataset, and update the evals that pin the expected
  recommendations. Each entry is self-contained, with embedded `docs[]` and
  `claims[]`.
- `amodal.json`: manifest: the chat agent (`session_types`), its intents, and
  the four stores. No third-party connectors required. (Evals need no manifest
  entry, `evals/*.md` is discovered.)
- `amodal.json` sets `memory.enabled: false`. Durable state lives in the stores, so each triage is a pure function of what is in them and there is nothing to carry across sessions in conversation memory.
