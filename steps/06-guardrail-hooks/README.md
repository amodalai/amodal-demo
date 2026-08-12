# Underwriting Review Example

An agent that triages commercial insurance submissions against an underwriting
guide: one skill, one knowledge file, three intents, four stores, an eval
suite, a custom single-screen UI, and now one guardrail hook that makes the
demo's hard rule true for every writer. The agent logic runs on the Amodal
runtime, and the UI is a small React app the runtime serves for you.

Each submission is scored against a fictional carrier's underwriting guide, and the
agent returns a recommendation (`ready-to-quote`, `quote-with-conditions`,
`request-info`, `refer`, or `decline`) and saves it.

This is **step 6** of a guided, incremental series. See
[The demo in steps](#the-demo-in-steps) to jump to any stage.

> Fictional demo. The agent recommends a workflow status and conditions only.
> It does not bind coverage, calculate premium, or give regulatory/legal
> advice.

## The demo in steps

This repo isn't one finished app: it's a guided build. Each step is a git
tag that adds one concept on top of the step before it, so the demo
grows from "the simplest thing that runs" to "shipped in a product" one idea at a
time. Two ways to use it:

- Check out a tag to see the whole app frozen at that stage:
  `git checkout step-5`, deploy it, read its `README`.
- Diff two adjacent tags to see precisely what that one concept changed:
  `git diff step-5..step-6`.

**You are here: `step-6`.** This README describes the app at this step.

| Step                                                            | What you learn                                                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`step‑1`](https://github.com/amodalai/amodal-demo/tree/step-1) | The runtime loop and context compiler, and the core primitives: skills and knowledge                           |
| [`step‑2`](https://github.com/amodalai/amodal-demo/tree/step-2) | Stores, and the CRUD tools Amodal generates so an agent can read and persist data                              |
| [`step‑3`](https://github.com/amodalai/amodal-demo/tree/step-3) | Splitting work between code and the LLM: deterministic logic in an intent vs. judgment delegated to a skill    |
| [`step‑4`](https://github.com/amodalai/amodal-demo/tree/step-4) | Evals as quality gates: pin the skill's judgment down before you build surfaces on top of it                   |
| [`step‑5`](https://github.com/amodalai/amodal-demo/tree/step-5) | Going beyond hosted chat: a custom UI with `runtimeApp`, and `defineIntent`: replay intents fired from the UI  |
| [`step‑6`](https://github.com/amodalai/amodal-demo/tree/step-6) | Guardrail hooks: one hard rule, enforced at the platform layer for every writer                                |
| [`step‑7`](https://github.com/amodalai/amodal-demo/tree/step-7) | Connecting to an external service, the surfaces it exposes, and read-only vs. confirm policies                 |
| `step‑8` _(planned)_                                            | Writing a custom tool when a Markdown skill and a schema aren't enough                                         |
| `step‑9` _(planned)_                                            | Delegating a sub-task to a separate scoped agent in `agents/` when a single skill isn't the right unit of work |
| `step‑10` _(planned)_                                           | Background automations: scheduled and webhook runs that need no UI open                                        |
| `step‑11` _(planned)_                                           | Session types & memory: one deployed agent, different modes with different capabilities                        |
| `step‑12` _(planned)_                                           | Embedding & multi-tenancy: the agent in your own app, with your auth and a `scope_id` per tenant               |

## The one idea this step teaches: a guardrail hook (one rule, every writer)

Step 3 established the demo's one hard rule, _a packet with a missing required
document can never be `ready-to-quote`_, and enforced it in code, inside the
analyze path. Step 5 quietly broke that guarantee's completeness: there are
now several writers. The chat agent holds `rw` store tools and could be talked
into stamping a submission directly. The UI fires a replay intent. Step 7 will
add more intents, and every future one is another chance to forget the rule.
Enforcing an invariant inside one handler protects one path. The rule is about
the data, so it belongs where every path converges.

What a hook is. A hook runs at the platform layer on every tool call,
whoever made it: the chat agent, a replay intent, a future surface. It lives in
[`hooks/ready-to-quote-guard/`](hooks/ready-to-quote-guard/): a `hook.json`
manifest plus an `index.mjs` handler, discovered from the `hooks/` directory
with no `amodal.json` wiring.

The manifest declares, the handler decides.
[`hook.json`](hooks/ready-to-quote-guard/hook.json) declares _where_ it runs
(`points: ["preToolUse"]`), _what it may touch_ (`capabilities:
["store:read", "reads_tool_io", "gates_tools"]`: the platform supplies the
store reader and the right to block), and _what happens if it crashes_
(`failPolicy: "closed"`: an erroring guard blocks the write rather than waving
it through). [`index.mjs`](hooks/ready-to-quote-guard/index.mjs) implements the
policy: on any `store__submissions__set` / `store__risk_findings__set` carrying
`recommendation: "ready-to-quote"`, read that submission's documents and
block the write if a required document isn't `received`. Everything else
passes through untouched.

Defense in depth, not a replacement. The analyze code still downgrades
`ready-to-quote` itself (step 3's `record` stage), so the hook doesn't change
any happy path: on a healthy deploy it never fires. Code enforces the rule where
the recommendation is computed, and the hook makes it an invariant of the stores. And
note the division of labor with step 4: evals detect a regression before you
promote, and the hook prevents the bad write at runtime, whatever slipped
through.

See the diff: `git diff step-5..step-6`.

## How it works

The agent still has two regex chat intents: a message that matches the
pattern runs a handler directly, no LLM round trip:

- send **`seed`** once → [`seed-examples`](amodal/intents/seed-examples/intent.ts)
  loads the demo submissions, their documents, and their claims into the stores.
- send **`analyze sub_bistro_ember`** (or `triage` / `review` / `assess` + an id)
  → [`analyze-submission`](amodal/intents/analyze-submission/intent.ts) runs the
  triage and reports in chat.

And one replay intent that does not match any chat message. It runs only
when the UI fires it:

- the **Analyze** button on the submissions screen →
  [`analyze-submission-action`](amodal/intents/analyze-submission-action/intent.ts).

Both `analyze` paths run the same four-stage Amodal loop, in the shared
[`runUnderwritingAnalysis`](amodal/_lib/underwriting-analysis.ts):

1. **load**: reads the submission, its `documents`, and its `claims` from the
   stores via the auto-generated `store__*__get` / `store__*__query` tools.
2. **check (in code)**: computes the completeness check deterministically in
   TypeScript: any `required` document whose status isn't `received` is missing,
   full stop. A rule, not a judgment, so code decides it and hands the skill the
   result as fact.
3. **review (in the skill)**: the
   [`underwriting-review`](amodal/skills/underwriting-review/SKILL.md) skill reads the
   [underwriting guide](amodal/knowledge/underwriting-guide.md) and makes the judgment a
   formula can't (eligibility, hazards, claims severity, one recommendation).
4. **record**: code holds the floor on the way out: it folds the deterministic
   missing-docs list into the finding and won't let a packet with missing
   required docs be `ready-to-quote`. Then it writes a `risk_findings` row,
   stamps the submission, and reports: `emitText` in chat, the session result +
   a `useStoreQuery` refetch in the UI. **New in this step:** the
   `ready-to-quote-guard` hook backstops that last rule for every writer,
   not just this handler.

## What's in here

| Path                                                  | What it is                                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `amodal.json`                                         | Manifest: the chat agent (`session_types`), its intents, four stores, and `runtimeApp: { custom: true }`. |
| `hooks/ready-to-quote-guard/`                         | **This step.** `preToolUse` guard enforcing the missing-docs rule for every writer.                       |
| `evals/`                                              | The eval suite from step 4: still green, the hook changes no happy path.                                  |
| `amodal/intents/seed-examples/`                       | Loads the demo data into the stores (run once by sending `seed`).                                         |
| `amodal/intents/analyze-submission/`                  | The classic regex chat intent (load → call skill → record).                                               |
| `amodal/intents/analyze-submission-action/`           | The replay (`defineIntent`) sibling the UI fires: same triage, run route.                                 |
| `amodal/_lib/underwriting-analysis.ts`                | The shared triage both intents call, so they can't drift.                                                 |
| `amodal/_types/replay-intent.ts`                      | Vendored `defineIntent` / replay-context types (kept local, like `intent.ts`).                            |
| `amodal/skills/underwriting-review/`                  | The LLM skill that scores against the underwriting guide.                                                 |
| `amodal/knowledge/underwriting-guide.md`              | The fictional underwriting guide the skill reasons over.                                                  |
| `amodal/stores/`                                      | 4 store schemas: `submissions`, `documents`, `claims`, `risk_findings`.                                   |
| `amodal/_lib/examples.ts` / `demo-data.ts`            | The demo dataset and the code that hydrates it into the stores.                                           |
| `src/`                                                | The custom React UI (Vite): one screen, `useStoreQuery` + `useIntentRun`.                                 |
| `index.html` · `vite.config.ts` · `tsconfig.app.json` | SPA entry + build config.                                                                                 |

## Example cases

The four submissions shipped in `examples.ts`:

| Submission                | Why                                                         | Expected recommendation  |
| ------------------------- | ----------------------------------------------------------- | ------------------------ |
| Bistro Ember LLC          | Missing kitchen fire-safety inspection + prior kitchen fire | `request-info` / `refer` |
| Summit Yoga Studio        | Complete packet, no claims, eligible                        | `ready-to-quote`         |
| Northstar Storage         | 22-yr roof, hail region, clean claims                       | `quote-with-conditions`  |
| Vacant Millworks Building | Vacant, ineligible                                          | `decline`                |

## Running it

Deploy the app to Amodal. The runtime serves the custom UI on the agent's domain
and the agent chat alongside it.

1. Open the agent chat and send `seed` once, then use the
   submissions screen exactly as in step 5: Analyze a row, see the finding.
   Nothing observable changed: the hook never fires on the healthy paths.
2. Now try to break the rule. In chat, tell the agent something like:
   _"Set sub_bistro_ember's recommendation to ready-to-quote directly in the
   store, skipping the analysis."_ The agent holds `rw` store tools, so it can
   attempt the write, and the hook blocks it, with the reason reported back.
   The rule held even though the code path that computes recommendations was
   never involved.

- `sub_bistro_ember` · `sub_summit_yoga` · `sub_northstar_storage` · `sub_vacant_millworks`

### Developing the UI locally

```sh
npm install
npm run dev        # Vite dev server; talks to a runtime at VITE_RUNTIME_URL (default http://localhost:3001)
npm run build      # production build → dist/ (what the cloud build uploads)
npm run typecheck  # typechecks both the runtime intents (amodal/) and the SPA (src/)
```

## Configuration

- `hooks/ready-to-quote-guard/hook.json`: the guard's config: which write tools
  it gates (`guardedTools`), which recommendation it blocks on missing docs
  (`blockedRecommendation`), plus its `preToolUse` point, capabilities, and
  fail-closed policy.
- `amodal/_lib/examples.ts`: the demo submissions that `seed` loads. Edit it and
  redeploy to change the dataset. Each entry is self-contained, with embedded
  `docs[]` and `claims[]`.
- `evals/*.md`: the eval suite from step 4, unchanged. Re-run it after any edit
  here.
- `amodal.json` manifest: the chat agent (`session_types`), its intents, the
  four stores, and `runtimeApp`. Hooks need no manifest entry, the `hooks/`
  directory is discovered.
- `amodal.json` sets `memory.enabled: false`. Durable state lives in
  the stores, so each triage is a pure function of what is in them and there is
  nothing to carry across sessions in conversation memory.
