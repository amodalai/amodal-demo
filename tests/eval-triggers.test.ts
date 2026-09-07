import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { stepsFrom } from "./helpers.js";

for (const root of [".", ...stepsFrom("04-evals")]) {
  const cases = readdirSync(`${root}/evals`).filter((name) =>
    /^(?:seed-demo-data|analyze-.+)\.md$/.test(name),
  );
  for (const name of cases) {
    test(`${root}/${name} sends an exact command and asserts its tool call`, () => {
      const content = readFileSync(`${root}/evals/${name}`, "utf8");
      const query = /^## Query\s+"([^"]+)"/m.exec(content)?.[1];
      assert.ok(query, "trigger evals have one quoted command");
      assert.doesNotMatch(content, /^Context:/m, "Setup Context is prepended to the command");
      const tool = query === "seed" ? "seed_examples" : "analyze_submission";
      const manifest = JSON.parse(readFileSync(`${root}/amodal/tools/${tool}/tool.json`, "utf8"));
      const trigger = manifest.triggers.find((t: { kind: string }) => t.kind === "regex");
      assert.ok(new RegExp(trigger.pattern, trigger.flags).test(query));
      const assertion = tool === "seed_examples"
        ? "- tool_called: seed_examples"
        : `- tool_called_with: analyze_submission ${JSON.stringify({ submission_id: query.split(" ")[1] })}`;
      assert.ok(content.split("\n").includes(assertion), assertion);
    });
  }
}
