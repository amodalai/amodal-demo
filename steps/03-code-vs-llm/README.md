# Underwriting Review Example

An agent that triages commercial insurance submissions against an underwriting
guide: one knowledge file, five stores, two triggered custom tools, and a
reviewer subagent that holds the judgment. No custom UI. It runs entirely on
the Amodal runtime. You deploy it and use it from the hosted chat.

Each submission is scored against a fictional carrier's underwriting guide, and the
agent returns a recommendation (`ready-to-quote`, `quote-with-conditions`,
`request-info`, `refer`, or `decline`) and saves it.

This is **step 3** of a guided, incremental series. See
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

**You are here: `steps/03-code-vs-llm`.** This README describes the app at
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
| repo root (step 8)             | Writing a custom tool the reviewer itself calls, when a prompt and a schema aren't enough                          |

## The one idea this step teaches: the code-vs-LLM split

In steps 1–2 the main agent did everything itself: it read the underwriting
guide, worked the stores, and reasoned to a recommendation. That's flexible, but
some of the work isn't a judgment call at all: _"which required documents are
missing?"_ has one correct answer, and you don't want the LLM to recount it (and
occasionally miscount) on every run.

Step 3 splits the work across two new primitives:

- A **custom tool** ([`amodal/tools/analyze_submission/`](amodal/tools/analyze_submission/)):
  a deterministic, code-defined handler with a regex **trigger**, so
  `analyze sub_x` fires it from the request path with no LLM round trip to
  decide what to do. The handler is where you put the parts that should be
  code.
- A **scoped subagent** ([`agents/underwriting-reviewer/`](agents/underwriting-reviewer/)):
  a second agent with its own prompt (`AGENT.md`) that holds only the parts
  that are genuinely judgment. The tool calls it via `ctx.callSubagent` and
  parses its JSON reply.

## How it works

This app has two triggered custom tools:

- send **`seed`** once → [`seed_examples`](amodal/tools/seed_examples/handler.ts)
  loads the demo submissions, their documents, and their claims into the stores.
- send **`analyze sub_bistro_ember`** (or `triage` / `review` / `assess` + an id)
  → [`analyze_submission`](amodal/tools/analyze_submission/handler.ts) runs the
  core loop, splitting the work between code and the LLM:

1. **load**: reads the submission, its `documents`, and its `claims` from the
   stores via the auto-generated `store__*__get` / `store__*__query` tools
   (declared in [`tool.json`](amodal/tools/analyze_submission/tool.json)
   `uses.tools`; undeclared calls fail closed).
2. **check (in code)**: computes the completeness check deterministically in
   TypeScript: any `required` document whose status isn't `received` is missing,
   full stop. This is a rule, not a judgment, so the handler decides it (the
   same answer every time) and hands the result to the reviewer as fact.
3. **review (in the subagent)**: the
   [`underwriting-reviewer`](agents/underwriting-reviewer/AGENT.md) subagent
   reads the [underwriting guide](amodal/knowledge/underwriting-guide.md)
   (passed in as input: subagents get only their own `AGENT.md` as prompt) and
   makes the judgment a formula can't (eligibility, hazards, claims severity,
   one recommendation). It's _told_ which required docs are missing rather than
   recounting them, and replies with a single JSON object that code parses.
4. **record**: code holds the floor on the way out: it folds the deterministic
   missing-docs list into the finding (the model can't drop one) and won't let a
   packet with missing required docs be `ready-to-quote`. Then it writes a
   `risk_findings` row, stamps the submission, and returns the result, which
   lands in the chat agent's context for reporting. It also appends an `analyzed` row to the
   `events` store, naming the recommendation and the score: the finding holds
   what the agent concluded, the trail holds that it concluded it and when.

The code-vs-LLM split. The deterministic part (which required documents are
missing) lives in code, and the judgment part (eligibility and the
recommendation) lives in the reviewer subagent. Code computes the facts and
enforces the hard rules, while the LLM reasons over clean inputs and can't
quietly miscount or overlook a missing document. See
[`amodal/_lib/underwriting-analysis.ts`](amodal/_lib/underwriting-analysis.ts).

What happens on fresh stores? `analyze` self-seeds, with a twist. A run
doesn't see its own uncommitted store writes, so `analyze` can't seed and then
re-read the store: its `get` would run before the seed committed. Instead,
when the id is a demo submission the store doesn't have yet, `analyze` seeds
the stores for later runs and analyzes the in-memory example directly in this
run. `seed` still works as an explicit load of everything at once. (Both are
idempotent, safe to resend.)

## What's in here

| Path                                     | What it is                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `amodal.json`                            | Manifest: name, version, memory off.                                                   |
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

`analyze` reads the packet from the stores, scores it with the reviewer
subagent, writes a `risk_findings` row, and stamps the submission, so the
result persists and can be re-read or re-analyzed. No custom UI, nothing to
run locally.

## Configuration

- `amodal/_lib/examples.ts`: the demo submissions that `seed` loads. Edit it and
  redeploy to change the dataset. Each entry is self-contained, with embedded
  `docs[]` and `claims[]`.
- `agents/default/agent.json`: the chat agent's tools and store access. The
  triggered tools also fire without the agent calling them; listing them lets
  the agent call `analyze_submission` itself for free-form requests.
- `amodal.json` sets `memory.enabled: false`. Durable state lives in the stores, so each triage is a pure function of what is in them and there is nothing to carry across sessions in conversation memory.
