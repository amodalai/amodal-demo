import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DECISIONS,
  noteReason,
  quoteBlockedReason,
  statusFor,
  type Decision,
} from "../amodal/_lib/decision.js";

const RECOMMENDATIONS = [
  "ready-to-quote",
  "quote-with-conditions",
  "request-info",
  "refer",
  "decline",
  null,
];

test("declining always needs a note", () => {
  for (const rec of RECOMMENDATIONS) {
    assert.match(noteReason("decline", rec) ?? "", /required to decline/, String(rec));
  }
});

test("quoting needs a note only against the agent's recommendation", () => {
  assert.equal(noteReason("quote", "ready-to-quote"), null);
  assert.equal(noteReason("quote", "quote-with-conditions"), null);
  for (const rec of ["request-info", "refer", "decline", null, undefined, "unknown"]) {
    assert.match(
      noteReason("quote", rec) ?? "",
      /required to quote against the agent's recommendation/,
      String(rec),
    );
  }
});

test("request-info and refer never need a note", () => {
  for (const decision of ["request-info", "refer"] as Decision[]) {
    for (const rec of RECOMMENDATIONS) {
      assert.equal(noteReason(decision, rec), null, `${decision} / ${rec}`);
    }
  }
});

test("a quote is blocked while information is outstanding, and only a quote", () => {
  const missing = ["Sprinkler certificate", "Roof inspection"];
  assert.equal(
    quoteBlockedReason("quote", missing),
    "Cannot quote while information is outstanding: Sprinkler certificate; Roof inspection.",
  );
  assert.equal(quoteBlockedReason("quote", []), null);
  for (const decision of ["request-info", "refer", "decline"] as Decision[]) {
    assert.equal(quoteBlockedReason(decision, missing), null, decision);
  }
});

test("request-info parks the submission, every other decision closes it", () => {
  assert.equal(statusFor("request-info"), "info-requested");
  for (const decision of ["quote", "refer", "decline"] as Decision[]) {
    assert.equal(statusFor(decision), "closed", decision);
  }
  assert.deepEqual([...DECISIONS], ["quote", "request-info", "refer", "decline"]);
});
