# Eval: Borderline Risk Quotes With Conditions

Northstar Storage has a complete packet and clean claims, but a 22-year-old
roof in a hail region. The right answer is neither a clean quote nor a decline:
quote, subject to conditions about the roof.

The analysis tool seeds demo data when stores are empty. This case can run
independently or as part of the suite.

## Query

"analyze sub_northstar_storage"

## Assertions

- tool_called_with: analyze_submission {"submission_id":"sub_northstar_storage"}
- contains: quote-with-conditions
- Should attach at least one condition about the roof
- Should NOT decline the submission
- Should NOT bind coverage or state a premium
