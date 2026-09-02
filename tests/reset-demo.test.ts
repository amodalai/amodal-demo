import { test } from "node:test";
import assert from "node:assert/strict";
import { resetDemo } from "../amodal/_lib/reset.js";
import { EXAMPLES, STORE_KEYS } from "../amodal/_lib/demo-data.js";
import { assertDeclared } from "./helpers.js";

test("removes every row in the four stores before seeding blind", async () => {
  const existing: Record<string, string[]> = {
    submissions: ["sub_a", "sub_b"],
    documents: ["sub_a_doc_1"],
    claims: [],
    risk_findings: ["find_sub_a", "find_sub_b", "find_sub_c"],
  };
  const calls: Array<[string, Record<string, unknown>]> = [];
  const out = await resetDemo({
    async callTool(name, args) {
      calls.push([name, args]);
      const m = /^store__(\w+)__list$/.exec(name);
      if (!m) return {};
      const field = STORE_KEYS[m[1] as keyof typeof STORE_KEYS];
      return { documents: existing[m[1]].map((k) => ({ payload: { [field]: k } })) };
    },
  });
  assert.deepEqual(out.removed, { submissions: 2, documents: 1, claims: 0, risk_findings: 3 });
  assert.equal(out.seeded, EXAMPLES.length);
  const names = calls.map(([n]) => n);
  const removes = calls.filter(([n]) => n.endsWith("__remove")).map(([n, a]) => `${n}:${a.key}`);
  assert.deepEqual(removes.sort(), Object.entries(existing).flatMap(([s, ks]) => ks.map((k) => `store__${s}__remove:${k}`)).sort());
  assert.ok(!names.some((n) => n.endsWith("__query")), "the seed runs blind");
  assert.ok(names.lastIndexOf("store__risk_findings__remove") < names.indexOf("store__submissions__set"), "every remove precedes the first seed write");
  assertDeclared("reset_demo", names);
});
