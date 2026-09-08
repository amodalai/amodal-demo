import assert from "node:assert/strict";
import { test } from "node:test";
import agent from "./agent.js";
import type { AgentSurfaceContext, SurfaceEntry } from "../../amodal/_types/agent-surface.js";

const context = (humanPresent: boolean): AgentSurfaceContext => ({
  claims: {}, context: {}, scopeId: "desk-pacific", humanPresent,
  isSubagent: false, agentName: "default",
});
const available = (entries: SurfaceEntry[], humanPresent: boolean) => entries
  .filter((entry) => typeof entry === "string" || !entry.conditional || entry.conditional(context(humanPresent)))
  .map((entry) => typeof entry === "string" ? entry : entry.name);

test("interactive chat can seed and delegate an underwriting review", () => {
  assert.ok(available(agent.tools, true).includes("seed_examples"));
  assert.ok(available(agent.subagents, true).includes("underwriting-reviewer"));
});

test("unattended runs cannot seed or dispatch conversational specialists", () => {
  assert.ok(!available(agent.tools, false).includes("seed_examples"));
  assert.deepEqual(available(agent.subagents, false), []);
});

test("interactive chat can delegate a weather check", () => {
  assert.ok(available(agent.subagents, true).includes("weather"));
});
