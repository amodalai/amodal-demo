import { test } from "node:test";
import assert from "node:assert/strict";
import decide_submission from "../amodal/tools/decide_submission/handler.js";
import { assertDeclared } from "./helpers.js";

const NOW = new Date("2026-09-02T09:00:00.000Z");

function fakeDesk(opts: { sub?: Record<string, unknown> | null; missing?: string[] } = {}) {
  const sub =
    opts.sub === undefined
      ? { submission_id: "sub_a", applicant_name: "Ember Bistro", recommendation: "refer", revision: 2 }
      : opts.sub;
  const calls: Array<[string, Record<string, unknown>]> = [];
  const ctx = {
    log: () => {},
    signal: new AbortController().signal,
    now: () => NOW.getTime(),
    random: () => 0.25,
    async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
      calls.push([name, args]);
      if (name === "store__submissions__get") return (sub ?? { error: "not found" }) as T;
      if (name === "store__risk_findings__get") return { missing_info: opts.missing ?? [] } as T;
      return {} as T;
    },
  };
  const writes = () => calls.filter(([n]) => n.endsWith("__set"));
  return { ctx, calls, writes };
}

test("records the decision, then the event, and reports the new status", async () => {
  const { ctx, calls, writes } = fakeDesk();
  const out = await decide_submission({ submission_id: "sub_a", decision: "request-info" }, ctx);
  assert.deepEqual(out, { submission_id: "sub_a", decision: "request-info", status: "info-requested" });
  assert.deepEqual(
    writes().map(([n]) => n),
    ["store__submissions__set", "store__events__set"],
  );
  assert.deepEqual(writes()[0][1].value, {
    submission_id: "sub_a",
    applicant_name: "Ember Bistro",
    recommendation: "refer",
    revision: 2,
    status: "info-requested",
    decision: "request-info",
    decision_note: null,
    decided_at: NOW.toISOString(),
    decided_by: "underwriter",
  });
  const event = writes()[1][1].value as Record<string, unknown>;
  assert.equal(event.kind, "decided");
  assert.equal(event.actor, "underwriter");
  assert.equal(event.revision, 2);
  assertDeclared("decide_submission", calls.map(([n]) => n));
});

test("a quote agreeing with the agent needs no note and closes the submission", async () => {
  const { ctx, writes } = fakeDesk({
    sub: { submission_id: "sub_a", applicant_name: "A", recommendation: "ready-to-quote" },
  });
  const out = await decide_submission({ submission_id: "sub_a", decision: "quote" }, ctx);
  assert.equal(out.status, "closed");
  assert.equal((writes()[0][1].value as Record<string, unknown>).decision_note, null);
});

test("a note is stored and carried into the event summary", async () => {
  const { ctx, writes } = fakeDesk();
  await decide_submission(
    { submission_id: "sub_a", decision: "decline", note: "  Vacant building.  " },
    ctx,
  );
  assert.equal((writes()[0][1].value as Record<string, unknown>).decision_note, "Vacant building.");
  assert.match(String((writes()[1][1].value as Record<string, unknown>).summary), /Vacant building\./);
});

test("rejects an unknown submission before reading anything else", async () => {
  const { ctx, calls } = fakeDesk({ sub: null });
  await assert.rejects(
    decide_submission({ submission_id: "sub_ghost", decision: "refer" }, ctx),
    /Submission sub_ghost not found\./,
  );
  assert.deepEqual(calls.map(([n]) => n), ["store__submissions__get"]);
});

test("rejects a blocked quote before any store write", async () => {
  const { ctx, writes } = fakeDesk({ missing: ["Sprinkler certificate"] });
  await assert.rejects(
    decide_submission({ submission_id: "sub_a", decision: "quote", note: "override" }, ctx),
    /Cannot quote while information is outstanding: Sprinkler certificate\./,
  );
  assert.deepEqual(writes(), [], "a refused decision leaves no trace");
});

test("rejects a decision that needs a note without one, before any store write", async () => {
  for (const decision of ["decline", "quote"]) {
    const { ctx, writes } = fakeDesk();
    await assert.rejects(
      decide_submission({ submission_id: "sub_a", decision, note: "   " }, ctx),
      /A note is required/,
      decision,
    );
    assert.deepEqual(writes(), []);
  }
});

test("rejects a missing id, an unknown decision, and a context without callTool", async () => {
  const { ctx } = fakeDesk();
  await assert.rejects(decide_submission({ decision: "refer" }, ctx), /No submission_id provided\./);
  await assert.rejects(
    decide_submission({ submission_id: "sub_a", decision: "approve" }, ctx),
    /Unknown decision "approve"/,
  );
  await assert.rejects(
    decide_submission(
      { submission_id: "sub_a", decision: "refer" },
      { ...ctx, callTool: undefined },
    ),
    /needs the composite context/,
  );
});
