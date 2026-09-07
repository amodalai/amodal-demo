# Eval: Seed Demo Data

Smoke-tests the `seed` trigger (the `seed_examples` tool): the `seed` message
must load (or confirm) the four demo submissions. The `analyze-*` evals
self-seed, so this eval can run anywhere in the suite; it pins the explicit
`seed` path.

## Query

"seed"

## Assertions

- tool_called: seed_examples
- contains: demo submission
- Should report that the demo submissions are loaded (either just now or already)
- Should suggest analyzing a submission next
- Should NOT report an error
