# Eval: Ineligible Submission Is Declined

The Vacant Millworks Building is vacant, and the underwriting guide lists
vacant buildings as ineligible. The triage must decline. If this eval fails, the guide
edit (or the reviewer subagent) stopped treating vacancy as a hard exclusion.

The analysis tool seeds demo data when stores are empty. This case can run
independently or as part of the suite.

## Query

"analyze sub_vacant_millworks"

## Assertions

- tool_called_with: analyze_submission {"submission_id":"sub_vacant_millworks"}
- contains: decline
- Should give vacancy as the reason
- Should NOT recommend ready-to-quote or quote-with-conditions
