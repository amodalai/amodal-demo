# Eval: Missing Required Docs Block Ready-To-Quote

Bistro Ember LLC is missing its required kitchen fire-safety inspection and has
a prior kitchen fire. The hard rule (a packet with missing required documents
can never be `ready-to-quote`) is enforced in code, and this eval pins it down:
whatever the reviewer subagent's judgment, the recommendation must ask for the
document, not clear the file.

The analysis tool seeds demo data when stores are empty. This case can run
independently or as part of the suite.

## Query

"analyze sub_bistro_ember"

## Assertions

- tool_called_with: analyze_submission {"submission_id":"sub_bistro_ember"}
- Should recommend request-info or refer
- Should NOT recommend ready-to-quote
- Should list the kitchen fire-safety inspection as missing
- Should mention the prior kitchen fire claim as a concern
