import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const step of ["01-skills-and-knowledge", "02-stores"]) {
  test(`${step} declares its underwriting prompt and grants on the default agent`, () => {
    const root = `steps/${step}`;
    const config = JSON.parse(readFileSync(`${root}/amodal.json`, "utf8"));
    assert.equal(config.session_types, undefined, "Cloud discards session_types");
    const agent = JSON.parse(readFileSync(`${root}/agents/default/agent.json`, "utf8"));
    const prompt = readFileSync(`${root}/agents/default/AGENT.md`, "utf8");
    assert.deepEqual(agent.skills, ["underwriting-review"]);
    assert.match(prompt, /It never binds coverage, prices premium, or gives legal\/regulatory advice\./);
    assert.equal(config.memory.enabled, false);
    if (step === "01-skills-and-knowledge") {
      assert.deepEqual(agent.stores ?? {}, {});
      assert.match(prompt, /Apply the `underwriting-review` skill to every such request/);
      assert.match(prompt, /reason over what the operator tells you in the conversation/);
    } else {
      assert.deepEqual(agent.stores, { submissions: "rw", documents: "rw", claims: "rw", risk_findings: "rw" });
      assert.match(prompt, /write the `submissions` row/);
      assert.match(prompt, /write a `risk_findings` row/);
      assert.match(prompt, /stamp the submission with `recommendation`, `risk_score`, and `status: in-review`/);
      assert.match(prompt, /Answer from the rows/);
    }
  });
}
