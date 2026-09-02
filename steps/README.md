# The demo, step by step

Each folder here is the complete app frozen at the end of one step of the
guided build. The repo root is always the **current** step — it is not
duplicated here.

| Folder                     | Concept                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `01-skills-and-knowledge/` | Runtime loop, context compiler, skills, knowledge               |
| `02-stores/`               | Stores, the generated CRUD tools, and an append-only event trail                             |
| `03-code-vs-llm/`          | Deterministic code vs. LLM judgment                             |
| `04-evals/`                | Evals as quality gates                                          |
| `05-custom-ui/`            | Custom UI (`runtimeApp`), roles and routes, and tools no agent holds                      |
| `06-guardrail-hooks/`      | Guardrail hooks: hard rules at the platform layer               |
| `07-gmail-connection/`     | External connection, read-only vs. confirm surfaces             |
| `08-custom-tool/`          | Writing a custom tool                                           |
| `09-model-delegation/`     | Model-initiated delegation (`call_subagent`)                    |
| `10-automations/`          | Background automations, and the confirm gate with no human present |
| `11-memory-and-surfaces/`  | Memory and conditional surfaces                                 |
| _(root)_                   | Step 12: embedding & multi-tenancy (`scope_id`)                 |

## Using the steps

- Read a step folder's own `README.md` — it describes the app as it was at
  that stage, and each folder deploys as-is.
- Diff adjacent steps to see exactly what one concept changed:

  ```sh
  diff -r steps/05-custom-ui steps/06-guardrail-hooks
  # last snapshot vs. the current step (the repo root):
  diff -r -x steps -x node_modules -x dist steps/11-memory-and-surfaces .
  ```

## Maintaining this layout

- **Fixing or updating a past lesson** is an ordinary commit touching that
  step's folder (and any later folders the change carries into). History stays
  linear and visible — `git log steps/05-custom-ui/` shows how that lesson
  evolved. No rewriting of historical commits.
- **Starting step N+1**: first snapshot the current root into a new
  `steps/0N-<concept>/` folder (copy every tracked root file except `steps/`
  itself), commit that snapshot unchanged, then build the new step at the
  root. That keeps "root = current step" true at every commit.
