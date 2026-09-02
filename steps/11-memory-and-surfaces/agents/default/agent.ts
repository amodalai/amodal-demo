// The chat agent's capability lists, in code: the only form that can carry a
// `conditional`. The declarative rest (name, description, stores) stays in
// the sibling agent.json; where both set a field, this file wins.
import type {
  AgentDefinition,
  AgentSurfaceContext,
} from "../../amodal/_types/agent-surface.js";

// False for automation/webhook/backfill runs: nobody is there to answer.
// Verified by the platform from how the run was triggered, so a request body
// cannot forge it (unlike `ctx.context`, which the caller controls).
const humanPresent = (ctx: AgentSurfaceContext) => ctx.humanPresent;

export default {
  tools: [
    "analyze_submission",
    "claims_stats",
    // The `seed` chat shortcut is the operator's. A headless run must never
    // fake data over a real mailbox sync: if the inbox is empty, an
    // unattended session files nothing. (The UI's first-open seed runs the
    // same tool through the invoke lane, which is not this agent.)
    { name: "seed_examples", conditional: humanPresent },
  ],
  subagents: [
    // What-if dispatches exist to answer a person mid-conversation. A
    // headless run has nobody asking, so it doesn't hold the specialist.
    { name: "underwriting-reviewer", conditional: humanPresent },
  ],
} satisfies AgentDefinition;
