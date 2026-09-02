# Underwriting Review Example

An agent that triages commercial insurance submissions against an underwriting
guide: one skill, one knowledge file, and five stores, no code and no custom
UI. It runs entirely on the Amodal runtime. You deploy it and use it from the
hosted chat.

You describe a business that has applied for coverage. The agent persists it,
scores it against a fictional carrier's underwriting guide, and saves a
recommendation: `ready-to-quote`, `quote-with-conditions`, `request-info`,
`refer`, or `decline`.

This is **step 2** of a guided, incremental series. See
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
  `diff -r steps/01-skills-and-knowledge steps/02-stores`.

**You are here: `steps/02-stores`.** This README describes the app at this step.

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

## The one idea this step teaches: stores + generated CRUD tools

Step 1 had no memory. Each triage lived and died in one message. Step 2 adds five
stores, each a JSON schema under [`amodal/stores/`](amodal/stores/):
`submissions`, `documents`, `claims`, `risk_findings`, and `events`. For every store Amodal
generates a set of CRUD tools (`store__submissions__set`,
`store__documents__query`, `store__risk_findings__get`, and so on) and hands them
to the agent. Persisting and recalling data is now something the agent does with
tools, no code required.

Four of them are row tables: they hold the current state of a thing, and every
write replaces what was there. `events` is the odd one out, an append-only trail
of what happened to a submission and who did it, so the history survives the
next write. Nothing in the demo can answer "who decided this, and when" from a
table that only keeps the latest value.

Still no custom tools and no custom UI: the manifest lists a `skills` array and a
`stores` map, and the agent drives the rest.

## How it works

You talk to the agent in chat and it works the stores directly:

1. **persist**: describe a business and the agent writes a `submissions` row,
   one `documents` row per item in the packet (each with its `required` flag and
   `received` / `requested` / `missing` status), and one `claims` row per past
   claim, via the generated `store__*__set` tools.
2. **read**: to triage, the agent reads the submission plus its `documents` and
   `claims` back with `store__*__get` / `store__*__query`.
3. **review**: the [`underwriting-review`](amodal/skills/underwriting-review/SKILL.md)
   skill reads the [underwriting guide](amodal/knowledge/underwriting-guide.md) and makes
   the judgment a formula can't (eligibility, hazards, claims severity, missing
   info, one recommendation).
4. **save**: the agent writes a `risk_findings` row and stamps the submission
   with the recommendation, risk score, and `status: in-review`.

Because the data persists, you can come back later and ask "What did we
recommend for Bistro Ember?" The agent answers from the stored rows, or
re-analyzes on request. But note what's doing the persisting: every one of
those writes is the agent following instructions, one LLM decision at a
time. The prompt tells it to save the finding and stamp the submission, but
nothing makes it.

## What's in here

| Path                                 | What it is                                                              |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `amodal.json`                        | Manifest: the chat agent (`session_types`) + its one skill + 5 stores.  |
| `amodal/skills/underwriting-review/` | The LLM skill that scores against the underwriting guide.               |
| `amodal/knowledge/underwriting-guide.md` | The fictional underwriting guide the skill reasons over.                |
| `amodal/stores/`                     | 5 store schemas: `submissions`, `documents`, `claims`, `risk_findings`, `events`. |

## Example cases

Describe one of these and the agent will persist it, then triage it:

| Business                  | Why                                                         | Expected recommendation  |
| ------------------------- | ----------------------------------------------------------- | ------------------------ |
| Bistro Ember LLC          | Missing kitchen fire-safety inspection + prior kitchen fire | `request-info` / `refer` |
| Summit Yoga Studio        | Complete packet, no claims, eligible                        | `ready-to-quote`         |
| Northstar Storage         | 22-yr roof, hail region, clean claims                       | `quote-with-conditions`  |
| Vacant Millworks Building | Vacant, ineligible                                          | `decline`                |

## Running it

Deploy the app to Amodal, then open its chat and describe a submission, for
example:

> Save and triage Bistro Ember LLC, a full-service restaurant in OR with a $1.8M
> building. The packet has the application, property details, and claims history,
> but the required kitchen fire-safety inspection is still missing. They had a
> $142k kitchen grease fire last year.

The agent writes the rows, reads them back, scores the packet with the skill,
writes a `risk_findings` row, and stamps the submission.

Then prove the persistence: the data now outlives the message that created
it.

1. Ask "What's the status on Bistro Ember LLC?" The agent answers by
   querying the `submissions` and `risk_findings` stores (watch the tool calls),
   not by re-reading the conversation.
2. Ask "Give me all the documents on Bistro Ember LLC". The agent queries
   the `documents` store and lists every row it wrote: kind, status, `required`
   flag, including the still-missing kitchen fire-safety inspection.
3. Open a new session and ask the same questions. Same answers.
   `memory.enabled` is `false`, so nothing carried over in conversation memory.
   The stores are the only place this data lives, and any session (or, from
   step 5 on, any UI) can read it.

When the answers don't match. You may see the follow-up report a
_different_ recommendation than the first triage: say `decline` at triage,
`request-info` when you ask for status. Look at the tool calls to see why: in
the first turn the agent saved the _packet_ (`submissions`, `documents`,
`claims`) but never wrote the `risk_findings` row or stamped the submission.
It reported the recommendation only in chat, where nothing outlives the
message. So the status query found stored facts but no stored judgment,
and the agent re-derived one on the spot (missing required doc → probably
`request-info`), landing somewhere else. That's the step-2 deal: the prompt
_asks_ the agent to persist the finding, but every write is an LLM decision,
so what gets saved (even the row IDs) can vary run to run. Making the record
step deterministic, with code that _always_ writes the finding, stamps the
submission, and enforces the hard rules, is exactly the one idea of step 3.

No code, no custom UI, nothing to run locally.

## Configuration

- `amodal/stores/*.json`: the five store schemas. The agent reads and writes
  these through the CRUD tools Amodal generates from them.
- `amodal/knowledge/underwriting-guide.md`: the underwriting rules the agent reasons over.
- `amodal.json`: manifest: the chat agent (`session_types`), its one skill, and
  the five stores. No third-party connectors required.
- `amodal.json` sets `memory.enabled: false`. Durable state lives in the stores, so
  each triage is a pure function of what is in them and there is nothing to
  carry across sessions in conversation memory.
