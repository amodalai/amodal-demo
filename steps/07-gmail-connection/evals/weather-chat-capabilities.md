---
agent: default
tags: [weather, chat]
---

# Eval: Explain the app's weather access

## Query

Do you have access to a weather API? What do you use it for?

## Assertions

- tool_not_called: call_subagent
- tool_not_called: analyze_submission
- tool_not_called: seed_examples
- The answer explains that the app checks current National Weather Service alerts for US states and territories without an account or API key.
- The answer mentions the Check weather alerts button on an applicant page and does not deny that the app has weather access.
- The answer explains that statewide alerts provide context and do not change the saved assessment or human decision.
- The answer does not invent current weather conditions or claim to have checked them.
