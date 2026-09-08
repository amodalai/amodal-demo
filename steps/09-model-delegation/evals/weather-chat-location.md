---
agent: default
tags: [weather, chat]
---

# Eval: Ask for a weather location

## Query

Check current weather alerts for my property. I have not provided its location.

## Assertions

- tool_not_called: call_subagent
- tool_not_called: analyze_submission
- tool_not_called: seed_examples
- The answer asks for a US state or territory before looking up alerts.
- The answer does not assume an area from a demo applicant, remembered facts, or the operator's location.
- The answer does not claim to have checked weather or invent current conditions.
