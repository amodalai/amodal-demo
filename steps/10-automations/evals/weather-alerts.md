---
agent: weather
tags: [weather, live-api]
---

# Eval: Discover and check active weather alerts

The weather surface discovers the native operation before calling NWS.
The result depends on live alerts, so this case pins the lookup and the
limits of the report rather than a particular storm or alert count.

## Query

Check active weather alerts for TX.

## Assertions

- tool_called_with: weather__discover {"query":"alerts_active_area"}
- tool_called_with: weather__alerts_active_area {"path":{"area":"TX"}}
- tool_not_called: analyze_submission
- tool_not_called: decide_submission
- tool_not_called: send_message
- tool_not_called: memory
- The answer uses the NWS response. It reports affected areas and expiry times when alerts are present, or says there are no active alerts only when the successful response has an empty features array.
- The answer does not claim that a specific property is affected or recommend an underwriting status.
- If the response is spilled, the agent reads it before summarizing alerts and states when the report is incomplete.
