import { test } from "node:test";
import assert from "node:assert/strict";
import list_pipeline from "../amodal/tools/list_pipeline/handler.js";
import { assertDeclared } from "./helpers.js";

const ROWS: Record<string, Array<Record<string, unknown>>> = {
  submissions: [{ submission_id: "sub_a", applicant_name: "Ember Bistro" }],
  risk_findings: [{ finding_id: "find_sub_a", submission_id: "sub_a", risk_score: 61 }],
  documents: [{ document_id: "sub_a_doc_1", submission_id: "sub_a", kind: "loss-run" }],
  events: [{ event_id: "evt_sub_a_1", submission_id: "sub_a", kind: "submitted" }],
};

function fakeDesk() {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const ctx = {
    log: () => {},
    signal: new AbortController().signal,
    now: () => Date.now(),
    random: () => 0.25,
    async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
      calls.push([name, args]);
      const store = /^store__(\w+)__query$/.exec(name)?.[1];
      return { documents: (ROWS[store ?? ""] ?? []).map((payload) => ({ payload })) } as T;
    },
  };
  return { ctx, calls };
}

test("returns every store the UI reads, declared and limited", async () => {
  const { ctx, calls } = fakeDesk();
  const out = await list_pipeline({}, ctx);
  assert.deepEqual(out, {
    submissions: ROWS.submissions,
    findings: ROWS.risk_findings,
    documents: ROWS.documents,
    events: ROWS.events,
  });
  assert.deepEqual(
    calls.map(([n, a]) => `${n}:${a.limit}`),
    [
      "store__submissions__query:200",
      "store__risk_findings__query:200",
      "store__documents__query:500",
      "store__events__query:500",
    ],
  );
  assertDeclared("list_pipeline", calls.map(([n]) => n));
});

test("refuses to run without the composite context", async () => {
  await assert.rejects(
    list_pipeline({}, { log: () => {}, signal: new AbortController().signal, now: () => 0, random: () => 0 }),
    /needs the composite context/,
  );
});
