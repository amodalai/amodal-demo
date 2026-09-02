import { test } from "node:test";
import assert from "node:assert/strict";
import { resetDemo } from "../amodal/_lib/reset.js";
import { EXAMPLES, STORE_KEYS } from "../amodal/_lib/demo-data.js";
import { assertDeclared } from "./helpers.js";

test("removes every row in every demo store before seeding blind", async () => {
  const existing: Record<string, string[]> = {
    submissions: ["sub_a", "sub_b"],
    documents: ["sub_a_doc_1"],
    claims: [],
    risk_findings: ["find_sub_a", "find_sub_b", "find_sub_c"],
    events: ["evt_seed_sub_a"],
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
  assert.deepEqual(out.removed, { submissions: 2, documents: 1, claims: 0, risk_findings: 3, events: 1 });
  assert.equal(out.seeded, EXAMPLES.length);
  const names = calls.map(([n]) => n);
  const removes = calls.filter(([n]) => n.endsWith("__remove")).map(([n, a]) => `${n}:${a.key}`);
  assert.deepEqual(removes.sort(), Object.entries(existing).flatMap(([s, ks]) => ks.map((k) => `store__${s}__remove:${k}`)).sort());
  assert.ok(!names.some((n) => n.endsWith("__query")), "the seed runs blind");
  assert.ok(names.lastIndexOf("store__events__remove") < names.indexOf("store__submissions__set"), "every remove precedes the first seed write");
  assertDeclared("reset_demo", names);
});

test("rejects a truncated store list before changing any store", async () => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  await assert.rejects(
    resetDemo({
      async callTool(name, args) {
        calls.push([name, args]);
        if (name === "store__documents__list") {
          return { documents: [], total: 1001, hasMore: true };
        }
        return { documents: [], total: 0, hasMore: false };
      },
    }),
    /cannot reset documents: store contains more than 1000 rows/i,
  );
  assert.ok(calls.every(([name]) => name.endsWith("__list")));
});
