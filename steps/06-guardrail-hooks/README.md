# Underwriting Review Example

An agent that triages commercial insurance submissions against an underwriting
guide: one knowledge file, four stores, two triggered custom tools, a reviewer
subagent, an eval suite, a custom single-screen React UI, and now a guardrail
hook that enforces the one hard rule at the platform layer. It runs on the
Amodal runtime, and the UI is a small React app the runtime serves for you.

Each submission is scored against a fictional carrier's underwriting guide, and the
agent returns a recommendation (`ready-to-quote`, `quote-with-conditions`,
`request-info`, `refer`, or `decline`) and saves it.

This is **step 6** of a guided, incremental series. See
[The demo in steps](#the-demo-in-steps) to jump to any stage.

> Fictional demo. The agent recommends a workflow status and conditions only.
> It does not bind coverage, calculate premium, or give regulatory/legal
> advice.

## The demo in steps

This repo isn't one finished app: it's a guided build. Each step adds one
concept on top of the step before it, so the demo grows from "the simplest
thing that runs" to "shipped in a product" one idea at a time. Every past step
is a self-contained snapshot under `steps/`; **the repo root is always the
current step**. Two ways to use it:

- Open a step folder to see the whole app frozen at that stage: read its
  `README.md`, deploy it as-is.
- Diff two adjacent steps to see precisely what that one concept changed:
  `diff -r steps/05-custom-ui steps/06-guardrail-hooks`.

**You are here: `steps/06-guardrail-hooks`.** This README describes the app
at this step.

| Step                           | What you learn                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `steps/01-skills-and-knowledge`| The runtime loop and context compiler, and the core primitives: skills and knowledge                               |
| `steps/02-stores`              | Stores, and the CRUD tools Amodal generates so an agent can read and persist data                                  |
| `steps/03-code-vs-llm`         | Splitting work between code and the LLM: deterministic logic in a custom tool vs. judgment in a reviewer subagent  |
| `steps/04-evals`               | Evals as quality gates: pin the reviewer's judgment down before you build surfaces on top of it                    |
| `steps/05-custom-ui`           | Going beyond hosted chat: a custom UI with `runtimeApp`, and tool runs fired from the UI                           |
| `steps/06-guardrail-hooks`     | Guardrail hooks: one hard rule, enforced at the platform layer for every writer                                    |
| `steps/07-gmail-connection`    | Connecting to an external service, the surfaces it exposes, and read-only vs. confirm policies                     |
| repo root (step 8)             | Writing a custom tool the reviewer itself calls, when a prompt and a schema aren't enough                          |

## The one idea this step teaches: a guardrail hook (one rule, every writer)

Step 3 established the demo's one hard rule, _a packet with a missing required
document can never be `ready-to-quote`_, and enforced it in code, inside the
analyze path. Step 5 quietly broke that guarantee's completeness: there are
now several writers. The chat agent holds `rw` store tools and could be talked
into stamping a submission directly. The UI fires the triage through the chat
surface. Step 7 will add more tools, and every future one is another chance to
forget the rule. Enforcing an invariant inside one handler protects one path.
The rule is about the data, so it belongs where every path converges.

What a hook is. A hook runs at the platform layer on every tool call,
whoever made it: the chat agent, a triggered tool, a future surface. It lives in
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

See the diff: `diff -r steps/05-custom-ui steps/06-guardrail-hooks`.

## How it works

The agent still has two triggered custom tools: a message that matches the
pattern fires the handler directly, no LLM round trip:

- send **`seed`** → [`seed_examples`](amodal/tools/seed_examples/handler.ts)
  loads the demo submissions, their documents, and their claims into the stores.
  The UI runs the same tool over the invoke lane (`useToolRun`) the first time
  it opens on an empty store, and **Reset demo data** runs `reset_demo` the
  same way to empty the stores and load the demo again.
- send **`analyze sub_bistro_ember`** (or `triage` / `review` / `assess` + an id)
  → [`analyze_submission`](amodal/tools/analyze_submission/handler.ts) runs the
  triage and reports in chat.

The **Analyze** button on the submissions screen fires the same
`analyze <id>` command through the chat surface, so both surfaces run the
identical path.

Both entry points run the same four-stage loop, in the shared
[`runUnderwritingAnalysis`](amodal/_lib/underwriting-analysis.ts):

1. **load**: reads the submission, its `documents`, and its `claims` from the
   stores via the auto-generated `store__*__get` / `store__*__query` tools.
2. **check (in code)**: computes the completeness check deterministically in
   TypeScript: any `required` document whose status isn't `received` is missing,
   full stop. A rule, not a judgment, so code decides it and hands the reviewer
   the result as fact.
3. **review (in the subagent)**: the
   [`underwriting-reviewer`](agents/underwriting-reviewer/AGENT.md) subagent
   reads the [underwriting guide](amodal/knowledge/underwriting-guide.md)
   (passed in as input) and makes the judgment a formula can't (eligibility,
   hazards, claims severity, one recommendation).
4. **record**: code holds the floor on the way out: it folds the deterministic
   missing-docs list into the finding and won't let a packet with missing
   required docs be `ready-to-quote`. Then it writes a `risk_findings` row,
   stamps the submission, and returns the result. **New in this step:** the
   `ready-to-quote-guard` hook backstops that last rule for every writer,
   not just this handler.

## What's in here

| Path                                                  | What it is                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `amodal.json`                                         | Manifest: name, version, memory off, and `runtimeApp: { custom: true }`.                       |
| `hooks/ready-to-quote-guard/`                         | **This step.** `preToolUse` guard enforcing the missing-docs rule for every writer.            |
| `evals/`                                              | The eval suite from step 4: still green, the hook changes no happy path.                       |
| `agents/default/`                                     | The chat agent: its prompt (`AGENT.md`) and its tools + store access (`agent.json`).           |
| `agents/underwriting-reviewer/`                       | The scoped subagent that holds the underwriting judgment.                                      |
| `amodal/tools/seed_examples/`                         | The durable seeding tool: the UI runs it over the invoke lane on first open, the `seed` regex trigger runs it from chat. |
| `amodal/tools/reset_demo/`                            | Durable invoke-lane tool for **Reset demo data**: lists and removes every row in the four stores, then seeds blind. |
| `amodal/tools/analyze_submission/`                    | The triggered composite tool (load → check in code → call the reviewer → record).              |
| `amodal/_lib/underwriting-analysis.ts`                | The shared triage flow every surface runs, so they can't drift.                                |
| `amodal/_lib/reset.ts`                                | `resetDemo`: the remove-then-seed sequence behind `reset_demo`.                                |
| `amodal/_types/tool-context.ts`                       | Local stub of the runtime's custom-tool context types, so the example typechecks offline.      |
| `amodal/knowledge/underwriting-guide.md`              | The fictional underwriting guide the reviewer reasons over.                                    |
| `amodal/stores/`                                      | 4 store schemas: `submissions`, `documents`, `claims`, `risk_findings`. All `deletable`, which registers the `__remove` tools the reset uses. |
| `amodal/_lib/examples.ts` / `demo-data.ts`            | The demo dataset and the code that hydrates it into the stores.                                |
| `src/`                                                | The custom React UI (Vite): one screen, `useStoreQuery` + `useToolRun` (seed/reset) + `RuntimeClient.chatStream`, the Reset confirm modal. |
| `index.html` · `vite.config.ts` · `tsconfig.app.json` | SPA entry + build config.                                                                      |

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

1. Open the submissions screen; the demo loads on first open, exactly as in
   step 5. Analyze a row, see the finding.
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
npm run typecheck  # typechecks both the runtime tools (amodal/) and the SPA (src/)
```

## Configuration

- `hooks/ready-to-quote-guard/hook.json`: the guard's config: which write tools
  it gates (`guardedTools`), which recommendation it blocks on missing docs
  (`blockedRecommendation`), plus its `preToolUse` point, capabilities, and
  fail-closed policy.
- `amodal/_lib/examples.ts`: the demo submissions the UI loads on first open
  (and `seed` and **Reset demo data**). Edit it and redeploy to change the
  dataset; click **Reset demo data** to see the edit. Each entry is
  self-contained, with embedded `docs[]` and `claims[]`.
- `evals/*.md`: the eval suite from step 4, unchanged. Re-run it after any edit
  here.
- `agents/default/agent.json`: the chat agent's tools and store access.
- `amodal.json` manifest: name, version, `runtimeApp`, memory off. Hooks need
  no manifest entry, the `hooks/` directory is discovered.
- `amodal.json` sets `memory.enabled: false`. Durable state lives in
  the stores, so each triage is a pure function of what is in them and there is
  nothing to carry across sessions in conversation memory.
