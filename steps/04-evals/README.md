# Underwriting Review Example

An agent that triages commercial insurance submissions against an underwriting
guide: one knowledge file, five stores, two triggered custom tools, a reviewer
subagent that holds the judgment, and an eval suite that pins the judgment
down. No custom UI. It runs entirely on the Amodal runtime. You deploy it and
use it from the hosted chat.

Each submission is scored against a fictional carrier's underwriting guide, and the
agent returns a recommendation (`ready-to-quote`, `quote-with-conditions`,
`request-info`, `refer`, or `decline`) and saves it.

This is **step 4** of a guided, incremental series. See
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
  `diff -r steps/03-code-vs-llm steps/04-evals`.

**You are here: `steps/04-evals`.** This README describes the app at this
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

## The one idea this step teaches: evals as quality gates

By step 3 the agent makes a judgment worth protecting: the same four
submissions should keep getting the same four recommendations after you edit
the reviewer, the underwriting guide, or the model. Nothing enforced that: you
could loosen the guide, deploy, and only find out from an operator that vacant
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
`analyze_submission` trigger, which runs the real code, calls the real
reviewer subagent, and writes a real finding. The suite tests the app you
deploy, not a mock of it.

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
to. Each `analyze-*` eval is self-contained: on fresh stores the
`analyze_submission` tool seeds the demo data itself, so the evals pass alone
and in any order.

See the diff: `diff -r steps/03-code-vs-llm steps/04-evals`.

## How it works

This app still has two triggered custom tools:

- send **`seed`** once → [`seed_examples`](amodal/tools/seed_examples/handler.ts)
  loads the demo submissions, their documents, and their claims into the stores.
- send **`analyze sub_bistro_ember`** (or `triage` / `review` / `assess` + an id)
  → [`analyze_submission`](amodal/tools/analyze_submission/handler.ts) runs the
  core loop, splitting the work between code and the LLM:

1. **load**: reads the submission, its `documents`, and its `claims` from the
   stores via the auto-generated `store__*__get` / `store__*__query` tools.
2. **check (in code)**: computes the completeness check deterministically in
   TypeScript: any `required` document whose status isn't `received` is missing,
   full stop. This is a rule, not a judgment, so the handler decides it (the
   same answer every time) and hands the result to the reviewer as fact.
3. **review (in the subagent)**: the
   [`underwriting-reviewer`](agents/underwriting-reviewer/AGENT.md) subagent
   reads the [underwriting guide](amodal/knowledge/underwriting-guide.md)
   (passed in as input) and makes the judgment a formula can't (eligibility,
   hazards, claims severity, one recommendation). It's _told_ which required
   docs are missing rather than recounting them, and replies with a single
   JSON object that code parses.
4. **record**: code holds the floor on the way out: it folds the deterministic
   missing-docs list into the finding (the model can't drop one) and won't let a
   packet with missing required docs be `ready-to-quote`. Then it writes a
   `risk_findings` row, stamps the submission, and returns the result. It also
   appends an `analyzed` row to the `events` store, naming the recommendation
   and the score: the finding holds what the agent concluded, the trail holds
   that it concluded it and when.

The evals pin down the outcomes of that loop: each `analyze-*` eval sends the
real chat message and asserts on the recommendation the agent reports.

## What's in here

| Path                                     | What it is                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `amodal.json`                            | Manifest: name, version, memory off.                                                   |
| `evals/`                                 | The eval suite: one per demo submission + seed smoke test + safety eval.               |
| `agents/default/`                        | The chat agent: its prompt (`AGENT.md`) and its tools + store access (`agent.json`).   |
| `agents/underwriting-reviewer/`          | The scoped subagent that holds the underwriting judgment.                              |
| `amodal/tools/seed_examples/`            | Loads the demo data into the stores (run once by sending `seed`).                      |
| `amodal/tools/analyze_submission/`       | The core tool (load from stores → check in code → call the reviewer → record).         |
| `amodal/knowledge/underwriting-guide.md` | The fictional underwriting guide the reviewer reasons over.                            |
| `amodal/stores/`                         | 5 store schemas: `submissions`, `documents`, `claims`, `risk_findings`, `events`.                |
| `amodal/_lib/examples.ts`                | The demo dataset: companies + docs + claims (edit + redeploy to change).               |
| `amodal/_lib/demo-data.ts`               | Hydrates `examples.ts` into the stores for `seed_examples` and the `analyze` fallback. |
| `amodal/_lib/underwriting-analysis.ts`   | The shared triage flow: the code-vs-LLM split, made explicit.                          |
| `amodal/_lib/events.ts`                  | `appendEvent`: the single writer for the `events` trail.                              |
| `amodal/_types/tool-context.ts`          | Local stub of the runtime's custom-tool context types, so the example typechecks offline. |

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
installs: change the reviewer or the guide → run the evals → promote only on
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
- `agents/default/agent.json`: the chat agent's tools and store access.
- `amodal.json` sets `memory.enabled: false`. Durable state lives in the stores, so each triage is a pure function of what is in them and there is nothing to carry across sessions in conversation memory.
