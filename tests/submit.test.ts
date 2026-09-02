import { test } from "node:test";
import assert from "node:assert/strict";
import { submitSubmission } from "../amodal/_lib/submit.js";
import type { AnalyzeDeps, DocumentRow } from "../amodal/_lib/underwriting-analysis.js";
import submit_submission from "../amodal/tools/submit_submission/handler.js";
import { assertDeclared } from "./helpers.js";

const NOW = new Date("2026-09-04T10:00:00.000Z");

const DOCS: DocumentRow[] = [
  { kind: "application", name: "Application", status: "received", required: true },
  { kind: "inspection", name: "Sprinkler certificate", status: "missing", required: true },
];

const FIELDS = {
  applicant_name: "Harbor Coffee & Co.",
  business_type: "Cafe",
  state: "WA",
  requested_by: "dana@harborbrokers.example",
  documents: DOCS,
};

function fakeDesk(opts: { previous?: Record<string, unknown>; existingDocs?: string[]; failReview?: boolean } = {}) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const deps: AnalyzeDeps = {
    async callTool(name, args) {
      calls.push([name, args]);
      if (name === "store__submissions__get") return opts.previous ?? { error: "not found" };
      if (name === "store__documents__query") {
        return { documents: (opts.existingDocs ?? []).map((document_id) => ({ payload: { document_id } })) };
      }
      if (name === "store__claims__query") return { documents: [] };
      return {};
    },
    async callSubagent() {
      if (opts.failReview) throw new Error("reviewer timed out");
      return JSON.stringify({ recommendation: "ready-to-quote", risk_score: 20 });
    },
    async loadGuide() {
      return "# guide";
    },
    now: () => NOW,
    random: () => 0.5,
    sessionId: "sess_1",
  };
  const writes = () => calls.filter(([n]) => n.endsWith("__set"));
  return { deps, calls, writes };
}

test("files the submission, then its documents, then the event, then reviews it", async () => {
  const { deps, calls, writes } = fakeDesk();
  const out = await submitSubmission(FIELDS, deps);

  assert.match(out.submission_id, /^sub_harbor_coffee_co_[0-9a-z]{4}$/);
  assert.equal(out.revision, 1);
  // The required sprinkler certificate is missing, so the review is clamped.
  assert.equal(out.recommendation, "request-info");
  assert.deepEqual(
    writes().map(([n, a]) => `${n}:${a.key}`),
    [
      `store__submissions__set:${out.submission_id}`,
      `store__documents__set:${out.submission_id}_doc_1`,
      `store__documents__set:${out.submission_id}_doc_2`,
      `store__events__set:evt_${NOW.getTime()}_submitted_i0000`,
      `store__risk_findings__set:find_${out.submission_id}`,
      `store__submissions__set:${out.submission_id}`,
      `store__events__set:evt_${NOW.getTime()}_analyzed_i0000`,
    ],
  );
  const row = writes()[0][1].value as Record<string, unknown>;
  assert.equal(row.status, "new");
  assert.equal(row.revision, 1);
  assert.equal(row.requested_by, FIELDS.requested_by);
  assert.equal(row.broker_email, FIELDS.requested_by);
  assert.equal(row.decision, null);
  assert.equal((writes()[3][1].value as Record<string, unknown>).kind, "submitted");
  assert.equal((writes()[3][1].value as Record<string, unknown>).actor, FIELDS.requested_by);
  assert.ok(!calls.some(([n]) => n === "store__submissions__get"), "a new filing reads nothing back");
  assertDeclared("submit_submission", calls.map(([n]) => n));
});

test("the review reads the rows this run holds, not the store", async () => {
  const { deps, calls } = fakeDesk();
  await submitSubmission(FIELDS, deps);
  const reads = calls.filter(([n]) => n.endsWith("__get") || n.endsWith("__query"));
  assert.deepEqual(reads, [], "a durable run cannot read back its own writes");
});

test("a resubmission keeps the id, bumps the revision, and replaces the packet", async () => {
  const { deps, calls, writes } = fakeDesk({
    previous: { submission_id: "sub_a", revision: 2, created_at: "2026-01-01T00:00:00.000Z", decision: "request-info" },
    existingDocs: ["sub_a_doc_1", "sub_a_doc_2", "sub_a_doc_3"],
  });
  const out = await submitSubmission({ ...FIELDS, submission_id: "sub_a" }, deps);

  assert.equal(out.submission_id, "sub_a");
  assert.equal(out.revision, 3);
  assert.deepEqual(
    calls.filter(([n]) => n === "store__documents__remove").map(([, a]) => a.key),
    ["sub_a_doc_1", "sub_a_doc_2", "sub_a_doc_3"],
  );
  const row = writes()[0][1].value as Record<string, unknown>;
  assert.equal(row.created_at, "2026-01-01T00:00:00.000Z", "the filing date is kept");
  assert.equal(row.revision, 3);
  assert.equal(row.decision, null, "the previous decision is cleared for a fresh review");
  const event = writes()[3][1].value as Record<string, unknown>;
  assert.equal(event.kind, "resubmitted");
  assert.equal(event.revision, 3);
});

test("resubmitting an unknown id is refused before anything is written", async () => {
  const { deps, writes } = fakeDesk();
  await assert.rejects(
    submitSubmission({ ...FIELDS, submission_id: "sub_ghost" }, deps),
    /Submission sub_ghost not found\./,
  );
  assert.deepEqual(writes(), []);
});

test("a failed review leaves the submission filed and says so", async () => {
  const { deps, writes } = fakeDesk({ failReview: true });
  await assert.rejects(
    submitSubmission(FIELDS, deps),
    /was filed as sub_harbor_coffee_co_\w+, but the review failed: reviewer timed out\. Analyze it again/,
  );
  const filed = writes().filter(([n]) => n === "store__submissions__set");
  assert.equal(filed.length, 1);
  assert.equal((filed[0][1].value as Record<string, unknown>).status, "new");
});

test("the handler rejects an incomplete filing and normalises the packet", async () => {
  const { deps } = fakeDesk();
  const ctx = {
    log: () => {},
    signal: new AbortController().signal,
    now: () => NOW.getTime(),
    random: () => 0.5,
    sessionId: "s",
    callTool: deps.callTool as never,
    callSubagent: deps.callSubagent as never,
    fs: { readRepoFile: async () => "# guide" },
  };
  await assert.rejects(submit_submission({ business_type: "Cafe", requested_by: "d" }, ctx), /applicant name is required/);
  await assert.rejects(submit_submission({ applicant_name: "A", requested_by: "d" }, ctx), /business type is required/);
  await assert.rejects(submit_submission({ applicant_name: "A", business_type: "B" }, ctx), /requested_by\) is required/);

  const seen: Array<Record<string, unknown>> = [];
  await submit_submission(
    {
      applicant_name: "A",
      business_type: "B",
      requested_by: "d",
      property_value_usd: "lots",
      documents: [{ name: "", kind: "x" }, { name: "Doc", status: "bogus" }],
    } as never,
    {
      ...ctx,
      callTool: (async (name: string, args: Record<string, unknown>) => {
        if (name.endsWith("__set")) seen.push(args.value as Record<string, unknown>);
        if (name === "store__claims__query" || name === "store__documents__query") return { documents: [] };
        return {};
      }) as never,
    },
  );
  assert.equal(seen[0].property_value_usd, null, "an unparseable number is dropped");
  const doc = seen[1];
  assert.equal(doc.name, "Doc", "the nameless entry is dropped");
  assert.equal(doc.status, "missing", "an unknown status falls back to missing");
  assert.equal(doc.required, false);
  assert.equal(doc.kind, "other");
});
