import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDeclarations } from "./extract.js";

interface Sub {
  applicant_name: string;
  [k: string]: unknown;
}
interface Finding {
  recommendation: string;
  missing_info?: string[];
  conditions?: string[];
  [k: string]: unknown;
}

const { previewSubject, previewReply } = await loadDeclarations<{
  previewSubject(s: Sub): string;
  previewReply(s: Sub, f: Finding): string;
}>(
  ["REPLY_OPENING", "previewSubject", "previewReply"],
  ["src/reply.ts", "src/App.tsx"],
);

const finding = (over: Partial<Finding> = {}): Finding => ({
  recommendation: "ready-to-quote",
  missing_info: [],
  conditions: [],
  ...over,
});

test("the subject drops non-ASCII from the applicant name", () => {
  assert.equal(
    previewSubject({ applicant_name: "Café Ember — Bistro" }),
    "Re: Caf Ember  Bistro - submission update",
  );
});

test("each recommendation gets its own opening line", () => {
  const openings = ["ready-to-quote", "quote-with-conditions", "request-info", "refer", "decline"].map(
    (recommendation) => previewReply({ applicant_name: "A" }, finding({ recommendation })).split("\n")[4],
  );
  assert.equal(new Set(openings).size, 5, "the five openings are distinct");
  assert.match(openings[0], /ready to prepare a quote/);
  assert.match(openings[4], /unable to offer terms/);
});

test("an unknown recommendation falls back to naming it", () => {
  const body = previewReply({ applicant_name: "A" }, finding({ recommendation: "escalate" }));
  assert.match(body, /Update on this submission: escalate\./);
});

test("missing info and conditions are listed under their own headings", () => {
  const body = previewReply(
    { applicant_name: "Ember Bistro" },
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
  const body = previewReply({ applicant_name: "A" }, finding());
  assert.ok(!body.includes("Still needed:"));
  assert.ok(!body.includes("Conditions:"));
});

test("every reply opens with the applicant and disclaims binding coverage", () => {
  const body = previewReply({ applicant_name: "Ember Bistro" }, finding());
  assert.equal(body.split("\n").slice(0, 4).join("|"), "Hello,||Re: Ember Bistro|");
  assert.match(body, /It does not bind coverage or confirm pricing\./);
  assert.ok(body.endsWith("— Underwriting"));
});
