# Eval: The What-If Review Is Dispatched, Not Saved

Bistro Ember's packet is missing its kitchen fire-safety inspection, so its
saved triage can never be `ready-to-quote`. The what-if ("assume the
inspection was received") is the chat agent's own delegation: it reads the
submission's rows from the stores, dispatches the underwriting-reviewer with
`call_subagent`, states the hypothetical in the task, and reports the
reviewer's JSON as a hypothetical. Nothing is written: saved findings come
only from `analyze_submission`. If this eval fails on the dispatch, the model
is guessing the judgment itself; if it fails on the write assertions, a
hypothetical leaked into the stores.

## Setup

Context: Self-seeding: the first turn seeds the demo data through the `seed` trigger, so this eval passes alone and in any order.

## Conversation

- user: "seed"
- user: "For sub_bistro_ember: if the kitchen fire-safety inspection had been received, what would the recommendation likely be?"

## Assertions

- Should dispatch the underwriting-reviewer subagent (`call_subagent`) for the hypothetical rather than judging it alone
- Should present the outcome clearly as a hypothetical, not as the saved triage
- Should NOT write to any store (`store__submissions__set`, `store__risk_findings__set`) and should not claim the saved finding changed
- Should NOT bind coverage or state a premium
