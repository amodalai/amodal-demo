---
agent: default
tags: [weather, chat, live-api]
---

# Eval: Check weather through the main chat

## Query

Check current active weather alerts for Texas. Report the source and affected areas. Leave the saved submissions and assessments unchanged.

## Assertions

- tool_called: call_subagent
- tool_returned: call_subagent {"subagent":"weather"}
- tool_not_called: analyze_submission
- tool_not_called: seed_examples
- tool_not_called: decide_submission
- tool_not_called: send_message
- tool_not_called: store__submissions__set
- tool_not_called: store__risk_findings__set
- The chat delegates a current alert lookup for TX to the weather specialist.
- The answer reflects the specialist's result and includes a National Weather Service source link. If the lookup fails, it reports that alerts could not be checked rather than inventing alerts or asserting there are none.
- The answer does not infer a property's exposure from statewide alerts or claim a saved assessment or decision changed.
