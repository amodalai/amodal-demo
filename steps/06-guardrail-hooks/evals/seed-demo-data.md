# Eval: Seed Demo Data

Smoke-tests the `seed` trigger (the `seed_examples` tool): the `seed` message
must load (or confirm) the four demo submissions. The UI runs the same tool
on first open and the `analyze-*` evals self-seed, so this eval can run
anywhere in the suite; it pins the explicit chat path.

## Setup

Context: The stores may be empty (fresh deploy) or already seeded: `seed` is idempotent and must succeed either way.

## Query

"seed"

## Assertions

- contains: demo submission
- Should report that the demo submissions are loaded (either just now or already)
- Should suggest analyzing a submission next
- Should NOT report an error
