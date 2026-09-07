# Eval: Eligible Submission Is Ready To Quote

Summit Yoga Studio is the clean case: complete packet, no claims, clearly
eligible. The triage must come back `ready-to-quote`. If this eval fails after
a reviewer or underwriting-guide edit, the change tightened the guide more than
intended.

The analysis tool seeds demo data when stores are empty. This case can run
independently or as part of the suite.

## Query

"analyze sub_summit_yoga"

## Assertions

- tool_called_with: analyze_submission {"submission_id":"sub_summit_yoga"}
- contains: ready-to-quote
- Should report a low risk score
- Should NOT list any missing required documents
- Should NOT bind coverage or state a premium
