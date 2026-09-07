import { test } from "node:test";
import assert from "node:assert/strict";
import { previewReply, previewSubject } from "../src/reply.js";
import type { FindingRow, SubmissionRow } from "../src/types.js";

const submission = (applicant_name: string): SubmissionRow => ({
  submission_id: "sub_a", applicant_name, business_type: "Restaurant",
});
const finding = (over: Partial<FindingRow> = {}): FindingRow => ({
  finding_id: "find_sub_a",
  submission_id: "sub_a",
  recommendation: "ready-to-quote",
  risk_score: 20,
  summary: "Complete packet.",
  missing_info: [],
  conditions: [],
  ...over,
});

test("the subject drops non-ASCII from the applicant name", () => {
  assert.equal(
    previewSubject(submission("Café Ember — Bistro")),
    "Re: Caf Ember  Bistro - submission update",
  );
});

test("each recommendation gets its own opening line", () => {
  const openings = ["ready-to-quote", "quote-with-conditions", "request-info", "refer", "decline"].map(
    (recommendation) => previewReply(submission("A"), finding({ recommendation })).split("\n")[4],
  );
  assert.equal(new Set(openings).size, 5, "the five openings are distinct");
  assert.match(openings[0], /ready to prepare a quote/);
  assert.match(openings[4], /unable to offer terms/);
});

test("an unknown recommendation falls back to naming it", () => {
  const body = previewReply(submission("A"), finding({ recommendation: "escalate" }));
  assert.match(body, /Update on this submission: escalate\./);
});

test("missing info and conditions are listed under their own headings", () => {
  const body = previewReply(
    submission("Ember Bistro"),
    finding({
      recommendation: "quote-with-conditions",
      missing_info: ["Sprinkler certificate"],
      conditions: ["Annual inspection", "Higher deductible"],
    }),
  );
  assert.match(body, /Still needed:\n {2}- Sprinkler certificate/);
  assert.match(body, /Conditions:\n {2}- Annual inspection\n {2}- Higher deductible/);
});

test("empty lists produce no headings", () => {
  const body = previewReply(submission("A"), finding());
  assert.ok(!body.includes("Still needed:"));
  assert.ok(!body.includes("Conditions:"));
});

test("every reply opens with the applicant and disclaims binding coverage", () => {
  const body = previewReply(submission("Ember Bistro"), finding());
  assert.equal(body.split("\n").slice(0, 4).join("|"), "Hello,||Re: Ember Bistro|");
  assert.match(body, /It does not bind coverage or confirm pricing\./);
  assert.ok(body.endsWith("— Underwriting"));
});
