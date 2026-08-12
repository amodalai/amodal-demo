# Eval: Ineligible Submission Is Declined

The Vacant Millworks Building is vacant, and the underwriting guide lists
vacant buildings as ineligible. The triage must decline. If this eval fails, the guide
edit (or the skill) stopped treating vacancy as a hard exclusion.

## Setup

Context: Self-seeding: on fresh stores the analyze intent loads the demo data itself, so this eval passes alone and in any order.

## Query

"analyze sub_vacant_millworks"

## Assertions

- contains: decline
- Should give vacancy as the reason
- Should NOT recommend ready-to-quote or quote-with-conditions
