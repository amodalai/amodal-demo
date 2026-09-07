import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { STEPS, stepsFrom } from "./helpers.js";

const roots = [".", ...stepsFrom("05-custom-ui")];
const stores = ["submissions", "documents", "claims", "risk_findings", "events"];

for (const root of roots) {
  test(`${root} blocks direct model writes even for a complete packet`, async () => {
    const hooksDir = `${root}/hooks`;
    const names = existsSync(hooksDir)
      ? readdirSync(hooksDir).filter((name) => existsSync(`${hooksDir}/${name}/hook.json`))
      : [];
    const hooks = await Promise.all(names.map(async (name) => {
      const manifest = JSON.parse(readFileSync(`${hooksDir}/${name}/hook.json`, "utf8"));
      const { createHook } = await import(pathToFileURL(resolve(hooksDir, name, "index.mjs")).href);
      return { ...manifest, ...createHook(manifest.config ?? {}) };
    }));
    const ctx = {
      caller: { source: "chat" },
      store: { query: async () => [{ required: true, status: "received" }] },
      log: () => {},
    };
    for (const store of stores) {
      for (const op of ["set", "remove"]) {
        const toolName = `store__${store}__${op}`;
        const args = {
          key: "sub_a",
          value: { submission_id: "sub_a", decision: "quote", status: "closed", actor: "underwriter" },
        };
        let blocked = false;
        for (const hook of hooks) {
          if (!hook.points.includes("preToolUse")) continue;
          if ((await hook.run("preToolUse", { toolName, args }, ctx)).action === "block") {
            blocked = true;
            break;
          }
        }
        assert.ok(blocked, `${toolName} must not bypass the authored workflow`);
      }
    }
    const agent = JSON.parse(readFileSync(`${root}/agents/default/agent.json`, "utf8"));
    for (const store of stores) assert.equal(agent.stores[store], "rw", "composites require registered store writers");
  });
}

test("the model-write guard starts at the human workflow lesson", () => {
  for (const step of STEPS.slice(0, STEPS.indexOf("05-custom-ui"))) {
    assert.equal(existsSync(`steps/${step}/hooks/model-store-write-guard`), false, step);
  }
});
