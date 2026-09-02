import { test } from "node:test";
import assert from "node:assert/strict";
import { appendEvent, seedEventId } from "../amodal/_lib/events.js";
import { EXAMPLES, ensureExamplesSeeded } from "../amodal/_lib/demo-data.js";

const NOW = new Date("2026-09-01T12:00:00.000Z");

function fakeStore() {
  const writes: Array<{ key: string; value: Record<string, unknown> }> = [];
  return {
    writes,
    ctx: {
      async callTool(name: string, args: Record<string, unknown>) {
        if (name === "store__events__set") {
          writes.push(args as { key: string; value: Record<string, unknown> });
        }
        if (name === "store__submissions__query") return { documents: [] };
        return {};
      },
      now: () => NOW,
      random: () => 0.5,
    },
  };
}

test("appendEvent writes the row through store__events__set", async () => {
  const { ctx, writes } = fakeStore();
  const id = await appendEvent(ctx, {
    submission_id: "sub_a",
    kind: "decided",
    actor: "underwriter",
    summary: "Quoted.",
    revision: 2,
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].key, id);
  assert.deepEqual(writes[0].value, {
    event_id: id,
    submission_id: "sub_a",
    kind: "decided",
    actor: "underwriter",
    summary: "Quoted.",
    revision: 2,
    created_at: NOW.toISOString(),
  });
});

test("a generated id carries the timestamp and a random suffix", async () => {
  const { ctx, writes } = fakeStore();
  await appendEvent(ctx, {
    submission_id: "sub_a",
    kind: "analyzed",
    actor: "agent",
    summary: "Scored.",
  });
  assert.match(writes[0].key, new RegExp(`^evt_${NOW.getTime()}_[0-9a-z]{5}$`));
  assert.equal(writes[0].value.revision, null, "an untied event carries no revision");
});

test("a supplied id is used verbatim, so the same append twice writes one row", async () => {
  const { ctx, writes } = fakeStore();
  const e = {
    submission_id: "sub_a",
    kind: "seeded" as const,
    actor: "system",
    summary: "Loaded.",
    event_id: seedEventId("sub_a"),
  };
  assert.equal(await appendEvent(ctx, e), "evt_seed_sub_a");
  assert.equal(await appendEvent(ctx, e), "evt_seed_sub_a");
  assert.deepEqual(new Set(writes.map((w) => w.key)), new Set(["evt_seed_sub_a"]));
});

test("seeding records one stable event per example", async () => {
  const { ctx, writes } = fakeStore();
  await ensureExamplesSeeded(ctx);
  assert.deepEqual(
    writes.map((w) => w.key),
    EXAMPLES.map((ex) => seedEventId(ex.submission_id)),
  );
  for (const w of writes) {
    assert.equal(w.value.kind, "seeded");
    assert.equal(w.value.actor, "system");
  }
});
