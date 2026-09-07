---
agent: default
scopeId: eval-memory-guidance
tags: [memory]
---

# Eval: Save and remove standing guidance

The underwriting chat can persist the operator's communication preferences
through the memory tool. This case uses a dedicated scope and asks the
agent to remove the entry after saving it.

## Conversation

- user: "Remember this standing guidance for future sessions: Example Broker prefers broker replies in three short bullet points. Save it in memory, not in the submission stores."
- user: "Forget the Example Broker preference you just saved. Remove that memory entry and leave every other memory unchanged."

## Assertions

- tool_called_with: memory {"action":"add"}
- tool_called_with: memory {"action":"remove"}
- no_failed_actions
- tool_not_called: store__submissions__set
- tool_not_called: store__risk_findings__set
- Should save the broker's communication preference in memory, then remove that same entry when asked.
- Should NOT change any submission, finding, or unrelated memory entry.
