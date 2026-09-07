import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import rootAgent from "../agents/default/agent.js";
import stepAgent from "../steps/11-memory-and-surfaces/agents/default/agent.js";

for (const [root, agent] of [[".", rootAgent], ["steps/11-memory-and-surfaces", stepAgent]] as const) {
  test(`${root} grants editable memory to the underwriting chat`, () => {
    const config = JSON.parse(readFileSync(`${root}/amodal.json`, "utf8"));
    assert.equal(config.memory.enabled, true);
    assert.equal(config.memory.editableBy, "any");
    assert.ok(agent.tools.includes("memory"), "editable memory also requires the agent's tool grant");
  });

  test(`${root} withholds memory from the weather surface`, () => {
    const weather = JSON.parse(readFileSync(`${root}/agents/weather/agent.json`, "utf8"));
    assert.deepEqual(weather.tools, []);
    assert.deepEqual(weather.skills, [], "skills must not grant memory transitively");
  });
}
