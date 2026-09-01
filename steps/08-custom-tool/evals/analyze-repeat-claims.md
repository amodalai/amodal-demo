# Eval: Repeat-Cause Claims Are Flagged

Bistro Ember has two kitchen fires (2021 and 2024), a repeat claim of the
same cause, which the underwriting guide sends to a senior underwriter. The
claims arithmetic (counts, largest amount, the 3-year window) comes from the
`claims_stats` custom tool, and the repeat-cause judgment stays with the
underwriting-reviewer subagent. This eval checks both halves: the numbers must
be right, and the repeat must be called out. If it fails after a reviewer or
tool edit, either the reviewer stopped calling the tool or it stopped judging
the descriptions.

## Setup

Context: Self-seeding: on fresh stores the analyze_submission tool loads the demo data itself, so this eval passes alone and in any order.

## Query

"analyze sub_bistro_ember"

## Assertions

- Should treat the claims history as a concern: two kitchen fires, a repeat of the same cause
- Should reflect that the larger claim exceeds $100k
- Should recommend request-info or refer
- Should NOT recommend ready-to-quote
- Should NOT bind coverage or state a premium
