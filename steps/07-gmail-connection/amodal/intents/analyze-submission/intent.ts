import type { IntentDefinition } from "../../_types/intent-context.js";
import {
  runUnderwritingAnalysis,
  type ReviewResult,
} from "../../_lib/underwriting-analysis.js";

export interface AnalyzeSubmissionInput {
  submission_id?: string;
}

const intent: IntentDefinition<AnalyzeSubmissionInput> = {
  id: "analyze-submission",
  regex:
    /^\s*(?:analyze|triage|review|assess)\s+(?<submission_id>sub_[a-z0-9_]+)\s*$/i,

  async handle(ctx) {
    const submission_id =
      ctx.input?.submission_id ?? ctx.match?.groups?.["submission_id"];
    if (!submission_id) return null;

    const outcome = await runUnderwritingAnalysis(submission_id, {
      callTool: (name, args) => ctx.callTool(name, args),
      callSkill: async (skillName, input) => {
        const { result } = await ctx.callSkill<ReviewResult>(skillName, input);
        return result;
      },
      now: () => new Date(),
      sessionId: ctx.sessionId,
    });

    if (!outcome.found) {
      ctx.emitText(
        `I couldn't find \`${submission_id}\` in the store, and it isn't ` +
          "one of the demo submissions. Check the id and try again.",
      );
      return {};
    }

    const lines = [
      `**${outcome.applicant_name}** — ${outcome.recommendation} (risk ${outcome.risk_score}/100)`,
      outcome.summary?.trim() ? `\n${outcome.summary.trim()}` : "",
      outcome.missing_info?.length
        ? `\n**Missing info:** ${outcome.missing_info.join("; ")}`
        : "",
      outcome.conditions?.length
        ? `\n**Conditions:** ${outcome.conditions.join("; ")}`
        : "",
      `\n_Saved as \`${outcome.finding_id}\`._`,
    ].filter(Boolean);
    ctx.emitText(lines.join("\n"));

    return {};
  },
};

export default intent;
