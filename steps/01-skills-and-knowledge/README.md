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

This repo isn't one finished app: it's a guided build. Each step adds one
concept on top of the step before it, so the demo grows from "the simplest
thing that runs" to "shipped in a product" one idea at a time. Every past step
is a self-contained snapshot under `steps/`; **the repo root is always the
current step**. Two ways to use it:

- Open a step folder to see the whole app frozen at that stage: read its
  `README.md`, deploy it as-is.
- Diff two adjacent steps to see precisely what that one concept changed:
  `diff -r steps/01-skills-and-knowledge steps/02-stores`.

**You are here: `steps/01-skills-and-knowledge`.** This README describes the app at this step.

| Step                           | What you learn                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `steps/01-skills-and-knowledge`| The runtime loop and context compiler, and the core primitives: skills and knowledge                               |
| `steps/02-stores`              | Stores, and the CRUD tools Amodal generates so an agent can read and persist data                                  |
| `steps/03-code-vs-llm`         | Splitting work between code and the LLM: deterministic logic in a custom tool vs. judgment in a reviewer subagent  |
| `steps/04-evals`               | Evals as quality gates: pin the reviewer's judgment down before you build surfaces on top of it                    |
| `steps/05-custom-ui`           | Going beyond hosted chat: a custom UI with `runtimeApp`, and tool runs fired from the UI                           |
| `steps/06-guardrail-hooks`     | Guardrail hooks: one hard rule, enforced at the platform layer for every writer                                    |
| `steps/07-gmail-connection`    | Connecting to an external service, the surfaces it exposes, and read-only vs. confirm policies                     |
| repo root (step 8)             | Writing a custom tool the reviewer itself calls, when a prompt and a schema aren't enough                          |

## The one idea this step teaches: the runtime loop and the context compiler

An Amodal agent is not a program you write, it is a loop the runtime runs. At
each turn the context compiler picks the material the session needs and
compiles it into the agent's context. At this step that material is the two
core primitives, both plain Markdown: a skill (expert reasoning, with a
`trigger` that says when it applies) and a knowledge file (what that reasoning
works over). The agent reads the compiled context, reasons, and replies.

Every step after this one builds on that same cycle. Stores, custom tools, custom
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
what it reasons over, and the main agent applies them. No custom tools, no stores, no
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
