import { defineIntent } from "../../_types/replay-intent.js";
import {
  runUnderwritingAnalysis,
  type ReviewResult,
} from "../../_lib/underwriting-analysis.js";

export interface AnalyzeSubmissionActionInput {
  submission_id: string;
}

export default defineIntent<AnalyzeSubmissionActionInput>({
  id: "analyze-submission-action",
  surface: {
    category: "triage",
    titleTemplate: "Triage {submission_id}",
    description:
      "Scores a submission against the underwriting guide and saves a risk finding. Same triage as the `analyze <id>` chat command, run from the submissions screen.",
    steps: [{ id: "analyze", label: "Load, score, and record the finding" }],
    permissionsSummary:
      "Reads submissions/documents/claims; writes risk_findings + submissions (and seeds the demo data on fresh stores).",
  },

  async handle(ctx) {
    const { submission_id } = ctx.input;
    if (!submission_id) {
      ctx.session.fail("No submission_id provided.");
      return;
    }

    ctx.session.advance("analyze");

    const outcome = await runUnderwritingAnalysis(submission_id, {
      callTool: (name, args) => ctx.callTool(name, args),
      callSkill: (skillName, input) =>
        ctx.callSkill<typeof input, ReviewResult>(skillName, input),
      now: () => ctx.now(),
      sessionId: ctx.sessionId,
    });

    if (!outcome.found) {
      ctx.session.setTitle(`${submission_id} — not found`);
      ctx.session.setMetadata({ found: false, submission_id });
      ctx.session.fail(
        `Submission ${submission_id} not found, and it is not one of the demo submissions.`,
      );
      return;
    }

    ctx.session.setTitle(
      `${outcome.applicant_name} — ${outcome.recommendation}`,
    );
    ctx.session.setMetadata({
      found: true,
      submission_id,
      recommendation: outcome.recommendation,
      risk_score: outcome.risk_score,
      finding_id: outcome.finding_id,
      missing_info: outcome.missing_info,
      conditions: outcome.conditions,
    });
    ctx.session.complete();
  },
});
