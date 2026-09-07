import { test } from "node:test";
import assert from "node:assert/strict";
import { createHook } from "./index.mjs";

const hook = createHook();

test("a model cannot forge a human decision, packet, or audit trail through store tools", () => {
  for (const store of ["submissions", "documents", "claims", "risk_findings", "events"]) {
    for (const op of ["set", "remove"]) {
      const result = hook.run("preToolUse", {
        toolName: `store__${store}__${op}`,
        args: { key: "sub_a", value: { decision: "decline", status: "closed", actor: "underwriter" } },
      });
      assert.equal(result.action, "block");
      assert.match(result.reason, /decisions and filings through the app/);
    }
  }
});

test("reads, memory, and authored workflow entry points remain available", () => {
  for (const toolName of ["store__submissions__get", "store__documents__query", "store__events__list", "memory", "seed_examples", "analyze_submission", "decide_submission", "submit_submission", "reset_demo"]) {
    assert.deepEqual(hook.run("preToolUse", { toolName, args: {} }), { action: "allow" }, toolName);
  }
});

test("other lifecycle points and caller claims do not widen the write path", () => {
  const payload = { toolName: "store__submissions__set", args: { source: "invoke", actor: "underwriter" } };
  assert.equal(hook.run("preToolUse", payload, { caller: { source: "chat", userId: "underwriter" } }).action, "block");
  assert.deepEqual(hook.run("postToolUse", payload), { action: "allow" });
  assert.deepEqual(hook.run("preInput", { text: "store__submissions__set" }), { action: "allow" });
});
