# Underwriting Review Example

The simplest possible Amodal app: an agent that triages commercial insurance
submissions against an underwriting guide. One skill, one knowledge file: no code,
no stores, no custom UI. It runs entirely on the Amodal runtime. You deploy it
and use it from the hosted chat.

You describe a business that has applied for coverage; the agent scores it against
a fictional carrier's underwriting guide and returns a recommendation:
`ready-to-quote`, `quote-with-conditions`, `request-info`, `refer`, or `decline`.

This is **step 1** of a guided, incremental series. See
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
  `git diff step-1..step-2`.

**You are here: `step-1`.** This README describes the app at this step.

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

## The one idea this step teaches: the runtime loop and the context compiler

An Amodal agent is not a program you write, it is a loop the runtime runs. At
each turn the context compiler picks the material the session needs and
compiles it into the agent's context. At this step that material is the two
core primitives, both plain Markdown: a skill (expert reasoning, with a
`trigger` that says when it applies) and a knowledge file (what that reasoning
works over). The agent reads the compiled context, reasons, and replies.

Every step after this one builds on that same cycle. Stores, intents, custom
tools, and sub-agents are new kinds of material the compiler can put in front
of the loop, but the loop itself never changes.

## How it works

There is no code in this step: the whole agent is a system prompt, one skill,
and one knowledge file. You describe a submission in chat and the main agent
runs the core Amodal loop itself:

1. **read**: the agent picks up the [`underwriting-review`](amodal/skills/underwriting-review/SKILL.md)
   skill, whose `trigger` matches "triage this submission." The skill and the
   [underwriting guide](amodal/knowledge/underwriting-guide.md) are compiled into the
   agent's context.
2. **review**: guided by the skill, the agent reasons over the underwriting guide and
   makes the judgment a formula can't: eligibility, hazards, claims severity,
   missing info, and a single recommendation.
3. **report**: it replies with the recommendation, a risk score, any missing
   info, and any conditions.

That's the whole loop: a skill is expert reasoning in Markdown, knowledge is
what it reasons over, and the main agent applies them. No intents, no stores, no
custom UI yet; nothing is persisted, so each session is self-contained.

## What's in here

| Path                                 | What it is                                                         |
| ------------------------------------ | ------------------------------------------------------------------ |
| `amodal.json`                        | Manifest: the chat agent (`session_types`) + the one skill.        |
| `amodal/skills/underwriting-review/` | The LLM skill that scores a submission against the underwriting guide. |
| `amodal/knowledge/underwriting-guide.md` | The fictional underwriting guide the skill reasons over.           |

## Example cases

Try describing one of these in chat (the agent has no stored data, so you give it
the details):

| Business                  | Why                                                         | Expected recommendation  |
| ------------------------- | ----------------------------------------------------------- | ------------------------ |
| Bistro Ember LLC          | Missing kitchen fire-safety inspection + prior kitchen fire | `request-info` / `refer` |
| Summit Yoga Studio        | Complete packet, no claims, eligible                        | `ready-to-quote`         |
| Northstar Storage         | 22-yr roof, hail region, clean claims                       | `quote-with-conditions`  |
| Vacant Millworks Building | Vacant, ineligible                                          | `decline`                |

## Running it

Deploy the app to Amodal, then open its chat and describe a submission, for
example:

> Triage Bistro Ember LLC, a full-service restaurant in OR with a $1.8M building.
> The packet has the application, property details, and claims history, but the
> kitchen fire-safety inspection is still missing. They had a $142k kitchen grease
> fire last year.

The agent applies the `underwriting-review` skill, reasons over the underwriting guide,
and replies with a recommendation and its reasoning.

## Configuration

- `amodal/knowledge/underwriting-guide.md`: the underwriting rules the agent reasons
  over. Edit it and redeploy to change what's eligible and what isn't.
- `amodal/skills/underwriting-review/SKILL.md`: how the agent reasons: the review
  areas, the recommendation options, and the safety rules.
- `amodal.json`: manifest: the chat agent (`session_types`) and the one skill.
  No stores, no third-party connectors required.
- `amodal.json` sets `memory.enabled: false`. This step has no persistence yet,
  so each run is self-contained and there is nothing to carry across sessions.
  (Durable state arrives with stores in step 2.)
