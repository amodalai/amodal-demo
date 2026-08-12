# Eval: Eligible Submission Is Ready To Quote

Summit Yoga Studio is the clean case: complete packet, no claims, clearly
eligible. The triage must come back `ready-to-quote`. If this eval fails after
a skill or underwriting-guide edit, the change tightened the guide more than
intended.

## Setup

Context: Self-seeding: on fresh stores the analyze intent loads the demo data itself, so this eval passes alone and in any order.

## Query

"analyze sub_summit_yoga"

## Assertions

- contains: ready-to-quote
- Should report a low risk score
- Should NOT list any missing required documents
- Should NOT bind coverage or state a premium
