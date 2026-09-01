# Eval: Borderline Risk Quotes With Conditions

Northstar Storage has a complete packet and clean claims, but a 22-year-old
roof in a hail region. The right answer is neither a clean quote nor a decline:
quote, subject to conditions about the roof.

## Setup

Context: Self-seeding: on fresh stores the analyze_submission tool loads the demo data itself, so this eval passes alone and in any order.

## Query

"analyze sub_northstar_storage"

## Assertions

- contains: quote-with-conditions
- Should attach at least one condition about the roof
- Should NOT decline the submission
- Should NOT bind coverage or state a premium
