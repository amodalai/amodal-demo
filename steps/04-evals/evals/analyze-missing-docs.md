# Eval: Missing Required Docs Block Ready-To-Quote

Bistro Ember LLC is missing its required kitchen fire-safety inspection and has
a prior kitchen fire. The hard rule (a packet with missing required documents
can never be `ready-to-quote`) is enforced in code, and this eval pins it down:
whatever the skill's judgment, the recommendation must ask for the document, not
clear the file.

## Setup

Context: Self-seeding: on fresh stores the analyze intent loads the demo data itself, so this eval passes alone and in any order.

## Query

"analyze sub_bistro_ember"

## Assertions

- Should recommend request-info or refer
- Should NOT recommend ready-to-quote
- Should list the kitchen fire-safety inspection as missing
- Should mention the prior kitchen fire claim as a concern
