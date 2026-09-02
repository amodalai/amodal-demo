import { test } from "node:test";
import assert from "node:assert/strict";
import { appendEvent, eventCtx, seedEventId } from "../amodal/_lib/events.js";
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

test("a generated id carries the timestamp, the kind, and a random suffix", async () => {
  const { ctx, writes } = fakeStore();
  await appendEvent(ctx, {
    submission_id: "sub_a",
    kind: "analyzed",
    actor: "agent",
    summary: "Scored.",
  });
  assert.match(writes[0].key, new RegExp(`^evt_${NOW.getTime()}_analyzed_[0-9a-z]{5}$`));
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

test("two kinds appended at the same instant get distinct ids", async () => {
  const { ctx, writes } = fakeStore();
  const base = { submission_id: "sub_a", actor: "x", summary: "y" };
  await appendEvent(ctx, { ...base, kind: "submitted" });
  await appendEvent(ctx, { ...base, kind: "analyzed" });
  assert.equal(new Set(writes.map((w) => w.key)).size, 2);
});

test("one kind appended repeatedly at the same instant gets distinct ids", async () => {
  const { ctx, writes } = fakeRuntime();
  const at = "2026-09-01T15:45:00.000Z";
  for (const submission_id of ["sub_a", "sub_b", "sub_c"])
    await appendEvent(eventCtx(ctx, at), {
      submission_id,
      kind: "submitted",
      actor: "broker@acme.example",
      summary: "Filed from the broker inbox.",
    });
  assert.equal(
    new Set(writes.map((w) => w.key)).size,
    3,
    "a sync loop's own rows must not overwrite each other",
  );
});

/** A runtime whose journaled primitives are methods that read their receiver, which is what
 *  detaching `random` from the context breaks. */
function fakeRuntime() {
  const writes: Array<{ key: string; value: Record<string, unknown> }> = [];
  return {
    writes,
    ctx: {
      seq: 7,
      async callTool(name: string, args: Record<string, unknown>) {
        if (name === "store__events__set") {
          writes.push(args as { key: string; value: Record<string, unknown> });
        }
        return {};
      },
      random(this: { seq: number }) {
        return this.seq++ / 100;
      },
    },
  };
}

test("eventCtx keeps random bound, so a receiver-dependent journaled random still works", async () => {
  const { ctx, writes } = fakeRuntime();
  const id = await appendEvent(eventCtx(ctx, "2026-09-01T15:45:00.000Z"), {
    submission_id: "sub_a",
    kind: "decided",
    actor: "underwriter",
    summary: "Quoted.",
  });
  assert.equal(ctx.seq, 8, "the call reached the runtime's own counter");
  assert.equal(writes[0].key, id);
});

test("eventCtx stamps the event with the timestamp the caller already wrote on the row", async () => {
  const { ctx, writes } = fakeRuntime();
  const nowIso = "2026-09-01T15:45:00.000Z";
  await appendEvent(eventCtx(ctx, nowIso), {
    submission_id: "sub_a",
    kind: "replied",
    actor: "underwriter",
    summary: "Emailed.",
  });
  assert.equal(writes[0].value.created_at, nowIso);
  assert.match(writes[0].key, new RegExp(`^evt_${new Date(nowIso).getTime()}_replied_[0-9a-z]{5}$`));
});

test("eventCtx leaves random unset when the runtime has none, so appendEvent falls back", async () => {
  const writes: Array<{ key: string; value: Record<string, unknown> }> = [];
  const ctx = {
    async callTool(name: string, args: Record<string, unknown>) {
      if (name === "store__events__set") writes.push(args as (typeof writes)[number]);
      return {};
    },
  };
  await appendEvent(eventCtx(ctx, "2026-09-01T15:45:00.000Z"), {
    submission_id: "sub_a",
    kind: "analyzed",
    actor: "agent",
    summary: "Scored.",
  });
  assert.equal(writes.length, 1);
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
