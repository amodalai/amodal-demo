# Eval: The Claims Window Comes From the Real Clock

Cascade Print Works has three closed claims with distinct causes, seeded at
two, three, and four years ago. Only the newest one falls in the 3-year
window, so the underwriting guide's frequency rule (3+ claims in the last 3
years) does not apply and the submission is squarely quotable. Getting that
right requires knowing what year it is, which the model does not: the window
must come from the `claims_stats` custom tool. This is the arithmetic half of
the claims rules; `analyze-repeat-claims` covers the judgment half. If this
eval fails, the reviewer subagent has stopped calling the tool and is dating
the claims from its own sense of today.

## Setup

Context: Self-seeding: on fresh stores the analyze_submission tool loads the demo data itself, so this eval passes alone and in any order.

## Query

"analyze sub_cascade_printworks"

## Assertions

- Should state that exactly 1 of the 3 claims falls in the last-3-years window, with the current real year as the as-of year
- Should NOT treat the history as frequent claims (3+ in the last 3 years)
- Should recommend ready-to-quote
- Should NOT recommend refer or decline
- Should NOT bind coverage or state a premium
