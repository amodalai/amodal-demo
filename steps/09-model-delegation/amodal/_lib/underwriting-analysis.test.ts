import assert from "node:assert/strict";
import { test } from "node:test";
import { EXAMPLES } from "./examples.js";
import { runUnderwritingAnalysis, type AnalyzeDeps } from "./underwriting-analysis.js";

const SUBMISSION = {
  submission_id: "sub_a",
  applicant_name: "Ember Bistro",
  business_type: "Restaurant",
  revision: 3,
  status: "in-review",
};
const REVIEW = JSON.stringify({ recommendation: "ready-to-quote", risk_score: 42 });

function reviewingDesk(afterReview: () => typeof SUBMISSION | undefined) {
  let submission: typeof SUBMISSION | undefined = SUBMISSION;
  let reviewed = false;
  const calls: string[] = [];
  const deps: AnalyzeDeps = {
    async callTool(name) {
      calls.push(name);
      if (name === "store__submissions__get") {
        return structuredClone(submission) ?? { error: "not found" };
      }
      if (name.endsWith("__query")) return { documents: [] };
      return {};
    },
    async callSubagent() {
      reviewed = true;
      submission = afterReview();
      return REVIEW;
    },
    loadGuide: async () => "# guide",
    now: () => new Date("2026-09-03T08:00:00.000Z"),
    sessionId: "session_a",
  };
  return { deps, calls, reviewed: () => reviewed };
}

test("a freshly seeded packet is analyzed without reading back pending writes", async () => {
  const { deps, calls } = reviewingDesk(() => undefined);
  const callTool = deps.callTool;
  deps.callTool = async (name, args) => {
    if (name === "store__submissions__get") {
      calls.push(name);
      return { error: "not found" };
    }
    return callTool(name, args);
  };
  const out = await runUnderwritingAnalysis(EXAMPLES[0].submission_id, deps);
  assert.equal(out.found, true);
  assert.equal(calls.filter((name) => name === "store__submissions__get").length, 1);
  assert.ok(calls.includes("store__risk_findings__set"));
});

test("a review of an older packet cannot overwrite a resubmission", async () => {
  const { deps, calls, reviewed } = reviewingDesk(() => ({
    ...SUBMISSION,
    revision: 4,
    applicant_name: "Revised applicant",
    status: "new",
  }));
  await assert.rejects(runUnderwritingAnalysis("sub_a", deps), /revision changed during analysis/);
  assert.equal(reviewed(), true);
  assert.ok(!calls.some((name) => name.endsWith("__set")));
});

test("a review cannot recreate a submission deleted while the reviewer ran", async () => {
  const { deps, calls, reviewed } = reviewingDesk(() => undefined);
  await assert.rejects(runUnderwritingAnalysis("sub_a", deps), /removed during analysis/);
  assert.equal(reviewed(), true);
  assert.ok(!calls.some((name) => name.endsWith("__set")));
});

test("a failed current-row read rejects the review before any writes", async () => {
  const { deps, calls, reviewed } = reviewingDesk(() => SUBMISSION);
  const callTool = deps.callTool;
  deps.callTool = async (name, args) => {
    if (name === "store__submissions__get" && reviewed()) throw new Error("Store unavailable");
    return callTool(name, args);
  };
  await assert.rejects(runUnderwritingAnalysis("sub_a", deps), /Store unavailable/);
  assert.ok(!calls.some((name) => name.endsWith("__set")));
});
