import { test } from "node:test";
import assert from "node:assert/strict";
import { previewReply, previewSubject } from "../../src/reply.js";
import type { FindingRow, SubmissionRow } from "../../src/types.js";
import send_outcome from "../tools/send_outcome/handler.js";
import { buildReply } from "./reply.js";

const SUB: SubmissionRow = {
  submission_id: "sub_a",
  applicant_name: "Café Ember — Bistro",
  business_type: "Restaurant",
  broker_email: "broker@example.invalid",
  revision: 2,
};
const FINDING: FindingRow = {
  finding_id: "find_sub_a",
  submission_id: "sub_a",
  recommendation: "ready-to-quote",
  risk_score: 20,
  summary: "Complete packet.",
  missing_info: [],
  conditions: [],
};

async function send(sub: SubmissionRow, finding: FindingRow, message?: string) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const { subject, body } = buildReply(sub, finding, message);
  const params = {
    submission_id: sub.submission_id, message,
    confirmation: { to: sub.broker_email?.trim() ?? "", subject, body },
  };
  const result = await send_outcome(params, {
    log: () => {},
    signal: new AbortController().signal,
    now: () => Date.parse("2026-09-07T10:00:00.000Z"),
    random: () => 0.5,
    async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
      calls.push([name, args]);
      if (name === "store__submissions__get") return sub as T;
      if (name === "store__risk_findings__get") return finding as T;
      return { message_id: "message_a" } as T;
    },
  });
  const email = calls.find(([name]) => name === "send_message")![1];
  const event = calls.find(([name]) => name === "store__events__set")![1].value as Record<string, unknown>;
  return { result, email, event };
}

test("the preview matches the sent subject and body for every recommendation", async () => {
  for (const recommendation of ["ready-to-quote", "quote-with-conditions", "request-info", "refer", "decline", "escalate"]) {
    for (const lists of [
      { missing_info: [], conditions: [] },
      { missing_info: ["Inspection"], conditions: ["Alarm certificate", "Annual inspection"] },
    ]) {
      const finding = { ...FINDING, recommendation, ...lists };
      const { email } = await send(SUB, finding);
      assert.equal(email.subject, previewSubject(SUB));
      assert.equal(email.body, previewReply(SUB, finding));
    }
  }
});

test("an operator note is trimmed and inserted before the outcome", async () => {
  const { email } = await send(SUB, FINDING, "  Please call tomorrow.  ");
  assert.equal(
    email.body,
    previewReply(SUB, FINDING).replace(
      `Re: ${SUB.applicant_name}\n\n`,
      `Re: ${SUB.applicant_name}\n\nPlease call tomorrow.\n\n`,
    ),
  );
  assert.equal((await send(SUB, FINDING, "  ")).email.body, previewReply(SUB, FINDING));
});

test("a saved human decision determines the email and recorded outcome", async () => {
  for (const [decision, recommendation, opening] of [
    ["decline", "ready-to-quote", /unable to offer terms/],
    ["refer", "ready-to-quote", /senior-underwriter review/],
    ["request-info", "decline", /additional information/],
    ["quote", "decline", /preparing a quote/],
  ] as const) {
    const sub = { ...SUB, decision };
    const finding = { ...FINDING, recommendation };
    const { email, result, event } = await send(sub, finding);
    assert.match(String(email.body), opening);
    assert.equal(email.body, previewReply(sub, finding));
    assert.equal(result.outcome, decision);
    assert.equal(result.decision, decision);
    assert.equal(result.recommendation, recommendation);
    assert.equal(event.summary, `Emailed the ${decision} outcome to ${SUB.broker_email}.`);
  }
});

test("a human quote keeps the conditions without claiming the guide was met", async () => {
  const sub = { ...SUB, decision: "quote" as const };
  const finding = { ...FINDING, recommendation: "refer", conditions: ["Annual inspection"] };
  const { email, result, event } = await send(sub, finding);
  assert.match(String(email.body), /subject to the conditions below/);
  assert.match(String(email.body), /Conditions:\n  - Annual inspection/);
  assert.doesNotMatch(String(email.body), /meets our underwriting guidelines/);
  assert.equal(email.body, previewReply(sub, finding));
  assert.equal(result.outcome, "quote-with-conditions");
  assert.equal(result.decision, "quote");
  assert.equal(event.summary, `Emailed the quote-with-conditions outcome to ${SUB.broker_email}.`);
});

test("declines and referrals omit stale information requests and quote conditions", async () => {
  const finding = { ...FINDING, missing_info: ["Inspection"], conditions: ["Annual inspection"] };
  for (const decision of ["decline", "refer", "request-info"] as const) {
    const sub = { ...SUB, decision };
    const { email } = await send(sub, finding);
    assert.doesNotMatch(String(email.body), /Conditions:/);
    assert.equal(String(email.body).includes("Still needed:"), decision === "request-info");
    assert.equal(email.body, previewReply(sub, finding));
  }
});

test("an absent or invalid decision keeps the recommendation email", async () => {
  for (const decision of [undefined, null, "approve"]) {
    const sub = { ...SUB, decision } as SubmissionRow;
    const { email, result, event } = await send(sub, FINDING);
    assert.equal(email.body, previewReply(SUB, FINDING));
    assert.equal(result.outcome, FINDING.recommendation);
    assert.equal(result.decision, null);
    assert.equal(event.summary, `Emailed the ready-to-quote outcome to ${SUB.broker_email}.`);
  }
});
