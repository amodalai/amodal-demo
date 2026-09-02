import { test } from "node:test";
import assert from "node:assert/strict";
import { EXAMPLES, NEW_SUBMISSION_DEFAULTS, ensureExamplesSeeded } from "../amodal/_lib/demo-data.js";
import { assertDeclared } from "./helpers.js";

const NOW = "2026-09-01T00:00:00.000Z";

/** The keys the seed writes for one example: the submission, then `_doc_N` and `_claim_N` rows. */
const keysOf = (ex: (typeof EXAMPLES)[number]) => [
  `submissions:${ex.submission_id}`,
  ...(ex.docs ?? []).map((_, i) => `documents:${ex.submission_id}_doc_${i + 1}`),
  ...(ex.claims ?? []).map((_, i) => `claims:${ex.submission_id}_claim_${i + 1}`),
];

function fakeSeedStore(present: string[]) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const ctx = {
    async callTool(name: string, args: Record<string, unknown>) {
      calls.push([name, args]);
      if (name !== "store__submissions__query") return {};
      return { documents: present.map((submission_id) => ({ payload: { submission_id } })) };
    },
    now: () => new Date(NOW),
  };
  const written = () => calls.filter(([n]) => n.endsWith("__set")).map(([n, a]) => `${/^store__(\w+)__/.exec(n)![1]}:${a.key}`);
  return { ctx, calls, written };
}

test("seeding writes the submission, documents, and claims of every missing example", async () => {
  const present = [EXAMPLES[1].submission_id, EXAMPLES[3].submission_id];
  const { ctx, calls, written } = fakeSeedStore(present);
  const seeded = await ensureExamplesSeeded(ctx);
  const missing = EXAMPLES.filter((ex) => !present.includes(ex.submission_id));
  assert.deepEqual(written(), missing.flatMap(keysOf));
  assert.equal(seeded, missing.length);
  for (const [name, args] of calls.filter(([n]) => n.endsWith("__set"))) {
    const row = args.value as Record<string, unknown>;
    assert.equal(row.created_at, NOW, name);
    assert.ok(missing.some((ex) => ex.submission_id === row.submission_id), `${name} ${args.key}`);
  }
  const first = calls.find(([n]) => n === "store__submissions__set")![1].value as Record<string, unknown>;
  assert.equal(first.submission_id, missing[0].submission_id);
  assert.equal(first.broker_email, missing[0].broker_email);
  for (const [k, v] of Object.entries(NEW_SUBMISSION_DEFAULTS)) assert.equal(first[k], v, k);
  assertDeclared("seed_examples", calls.map(([n]) => n));
});

test("seeding with every example present writes nothing", async () => {
  const { ctx, written } = fakeSeedStore(EXAMPLES.map((ex) => ex.submission_id));
  assert.equal(await ensureExamplesSeeded(ctx), 0);
  assert.deepEqual(written(), []);
});
