# Underwriting Review Example

An agent that triages commercial insurance submissions against an underwriting
guide: one skill, one knowledge file, and four stores, no code and no custom
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

This repo isn't one finished app: it's a guided build. Each step is a git
tag that adds one concept on top of the step before it, so the demo
grows from "the simplest thing that runs" to "shipped in a product" one idea at a
time. Two ways to use it:

- Check out a tag to see the whole app frozen at that stage:
  `git checkout step-1`, deploy it, read its `README`.
- Diff two adjacent tags to see precisely what that one concept changed:
  `git diff step-1..step-2`.

**You are here: `step-2`.** This README describes the app at this step.

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

## The one idea this step teaches: stores + generated CRUD tools

Step 1 had no memory. Each triage lived and died in one message. Step 2 adds four
stores, each a JSON schema under [`amodal/stores/`](amodal/stores/):
`submissions`, `documents`, `claims`, and `risk_findings`. For every store Amodal
generates a set of CRUD tools (`store__submissions__set`,
`store__documents__query`, `store__risk_findings__get`, and so on) and hands them
to the agent. Persisting and recalling data is now something the agent does with
tools, no code required.

Still no intents and no custom UI: the manifest lists a `skills` array and a
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
| `amodal.json`                        | Manifest: the chat agent (`session_types`) + its one skill + 4 stores.  |
| `amodal/skills/underwriting-review/` | The LLM skill that scores against the underwriting guide.               |
| `amodal/knowledge/underwriting-guide.md` | The fictional underwriting guide the skill reasons over.                |
| `amodal/stores/`                     | 4 store schemas: `submissions`, `documents`, `claims`, `risk_findings`. |

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

- `amodal/stores/*.json`: the four store schemas. The agent reads and writes
  these through the CRUD tools Amodal generates from them.
- `amodal/knowledge/underwriting-guide.md`: the underwriting rules the agent reasons over.
- `amodal.json`: manifest: the chat agent (`session_types`), its one skill, and
  the four stores. No third-party connectors required.
- `amodal.json` sets `memory.enabled: false`. Durable state lives in the stores, so
  each triage is a pure function of what is in them and there is nothing to
  carry across sessions in conversation memory.
