import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findingKey,
  runUnderwritingAnalysis,
  type AnalyzeDeps,
} from "../amodal/_lib/underwriting-analysis.js";
import { EXAMPLES } from "../amodal/_lib/demo-data.js";
import { assertDeclared } from "./helpers.js";

const NOW = new Date("2026-09-03T08:00:00.000Z");
const GUIDE = "# guide";

const REVIEW: {
  recommendation: string;
  risk_score: number;
  summary: string;
  cards: Array<{ category: string; status: string; note: string }>;
  missing_info: string[];
  conditions: string[];
} = {
  recommendation: "ready-to-quote",
  risk_score: 42,
  summary: "Clean packet.",
  cards: [{ category: "claims", status: "pass", note: "No open claims." }],
  missing_info: [],
  conditions: [],
};

const SUB = {
  submission_id: "sub_a",
  applicant_name: "Ember Bistro",
  business_type: "Restaurant",
  state: "CA",
  property_value_usd: 100,
  annual_revenue_usd: 200,
  revision: 3,
};

function fakeDesk(opts: {
  submission?: Record<string, unknown> | null;
  documents?: unknown[];
  claims?: unknown[];
  review?: Partial<typeof REVIEW> | string;
} = {}) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const subagent: Array<[string, string, unknown]> = [];
  const traces: string[] = [];
  const submission = opts.submission === undefined ? SUB : opts.submission;
  const deps: AnalyzeDeps = {
    async callTool(name, args) {
      calls.push([name, args]);
      if (name === "store__submissions__get") return submission ?? { error: "not found" };
      if (name === "store__documents__query") {
        return { documents: (opts.documents ?? []).map((payload) => ({ payload })) };
      }
      if (name === "store__claims__query") {
        return { documents: (opts.claims ?? []).map((payload) => ({ payload })) };
      }
      if (name === "store__submissions__query") return { documents: [] };
      return {};
    },
    async callSubagent(ref, task, input) {
      subagent.push([ref, task, input]);
      return typeof opts.review === "string"
        ? opts.review
        : JSON.stringify({ ...REVIEW, ...opts.review });
    },
    async loadGuide() {
      return GUIDE;
    },
    now: () => NOW,
    random: () => 0.5,
    sessionId: "sess_1",
    trace: (line) => traces.push(line),
  };
  const writes = () => calls.filter(([n]) => n.endsWith("__set"));
  return { deps, calls, writes, subagent, traces };
}

test("analyses a stored submission: finding, then submission, then event", async () => {
  const { deps, calls, writes, subagent } = fakeDesk({
    documents: [{ kind: "application", name: "App", status: "received", required: true, notes: null }],
    claims: [{ year: 2024, description: "Small fire", amount_usd: 100, open: false }],
  });
  const out = await runUnderwritingAnalysis("sub_a", deps);

  assert.deepEqual(out, {
    found: true,
    submission_id: "sub_a",
    applicant_name: "Ember Bistro",
    recommendation: "ready-to-quote",
    risk_score: 42,
    summary: "Clean packet.",
    cards: REVIEW.cards,
    missing_info: [],
    conditions: [],
    finding_id: findingKey("sub_a"),
  });
  assert.deepEqual(
    calls.map(([n]) => n),
    [
      "store__submissions__get",
      "store__documents__query",
      "store__claims__query",
      "store__risk_findings__set",
      "store__submissions__set",
      "store__events__set",
    ],
  );
  assert.deepEqual(writes()[0][1].value, {
    finding_id: "find_sub_a",
    submission_id: "sub_a",
    recommendation: "ready-to-quote",
    risk_score: 42,
    summary: "Clean packet.",
    cards: REVIEW.cards,
    missing_info: [],
    conditions: [],
    analyzer_session_id: "sess_1",
    created_at: NOW.toISOString(),
  });
  assert.deepEqual(writes()[1][1].value, {
    ...SUB,
    status: "in-review",
    recommendation: "ready-to-quote",
    risk_score: 42,
    analyzed_at: NOW.toISOString(),
    // SUB predates these columns; the write fills them so the row stays valid.
    broker_email: null,
    reply_status: "not-sent",
    replied_at: null,
    decision: null,
    decision_note: null,
    decided_at: null,
    decided_by: null,
    requested_by: null,
  });
  const event = writes()[2][1].value as Record<string, unknown>;
  assert.equal(event.kind, "analyzed");
  assert.equal(event.actor, "agent");
  assert.equal(event.revision, 3);

  const [ref, , input] = subagent[0];
  assert.equal(ref, "underwriting-reviewer");
  assert.deepEqual((input as Record<string, unknown>).underwriting_guide, GUIDE);
  assert.deepEqual((input as Record<string, unknown>).missing_required_documents, []);
  assert.deepEqual((input as Record<string, unknown>).claims, [
    { year: 2024, description: "Small fire", amount_usd: 100, open: false },
  ]);
  assertDeclared("analyze_submission", calls.map(([n]) => n));
});

test("a legacy row's analyzed event carries the revision written to the row", async () => {
  const { revision: _, ...legacySub } = SUB;
  const { deps, writes } = fakeDesk({ submission: legacySub });
  await runUnderwritingAnalysis("sub_a", deps);
  const submission = writes()[1][1].value as Record<string, unknown>;
  const event = writes()[2][1].value as Record<string, unknown>;
  assert.equal(event.revision, submission.revision);
});

test("a missing required document clamps ready-to-quote and joins the missing-info list", async () => {
  const { deps, writes } = fakeDesk({
    documents: [
      { kind: "inspection", name: "Sprinkler certificate", status: "requested", required: true },
      { kind: "photos", name: "Photos", status: "missing", required: false },
    ],
    review: { missing_info: ["Roof age"] },
  });
  const out = await runUnderwritingAnalysis("sub_a", deps);
  assert.equal(out.recommendation, "request-info");
  assert.deepEqual(out.missing_info, ["Sprinkler certificate", "Roof age"]);
  assert.equal((writes()[1][1].value as Record<string, unknown>).recommendation, "request-info");
});

test("an unrecognised recommendation becomes request-info", async () => {
  const { deps } = fakeDesk({ review: { recommendation: "bind-it" } });
  assert.equal((await runUnderwritingAnalysis("sub_a", deps)).recommendation, "request-info");
});

test("the risk score is rounded and clamped into 0-100, defaulting to 50", async () => {
  for (const [given, expected] of [[150, 100], [-5, 0], [41.6, 42]] as const) {
    const { deps } = fakeDesk({ review: { risk_score: given } });
    assert.equal((await runUnderwritingAnalysis("sub_a", deps)).risk_score, expected, String(given));
  }
  const { deps } = fakeDesk({ review: '{"recommendation":"refer"}' });
  assert.equal((await runUnderwritingAnalysis("sub_a", deps)).risk_score, 50);
});

test("an unknown id on a fresh store is reported, with nothing written", async () => {
  const { deps, calls, subagent } = fakeDesk({ submission: null });
  assert.deepEqual(await runUnderwritingAnalysis("sub_ghost", deps), {
    found: false,
    submission_id: "sub_ghost",
  });
  assert.deepEqual(calls.map(([n]) => n), ["store__submissions__get"]);
  assert.deepEqual(subagent, []);
});

test("a demo id on a fresh store seeds the dataset and analyses the in-memory example", async () => {
  const example = EXAMPLES[0];
  const { deps, calls, subagent } = fakeDesk({ submission: null });
  const out = await runUnderwritingAnalysis(example.submission_id, deps);

  assert.equal(out.found, true);
  assert.equal(out.applicant_name, example.applicant_name);
  assert.ok(
    calls.some(([n, a]) => n === "store__submissions__set" && a.key === EXAMPLES[1].submission_id),
    "the whole dataset is seeded, not just the requested submission",
  );
  assert.deepEqual(
    (subagent[0][2] as { documents: unknown[] }).documents,
    (example.docs ?? []).map((d) => ({
      kind: d.kind,
      name: d.name,
      status: d.status,
      required: d.required,
      notes: d.notes ?? null,
    })),
  );
});

test("an unparseable review is surfaced as an error", async () => {
  const { deps, writes } = fakeDesk({ review: "the reviewer said no" });
  await assert.rejects(runUnderwritingAnalysis("sub_a", deps), /returned no JSON object/);
  assert.deepEqual(writes(), []);
});
