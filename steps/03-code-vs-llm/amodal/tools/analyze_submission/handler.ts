import type { CustomToolContext } from "../../_types/tool-context.js";
import { runUnderwritingAnalysis } from "../../_lib/underwriting-analysis.js";

/** Single source of truth for the underwriting rules, repo-relative. */
const GUIDE_PATH = "amodal/knowledge/underwriting-guide.md";

export interface AnalyzeSubmissionParams {
  submission_id?: string;
}

/**
 * Composite tool behind both triage entry points: the `analyze <id>` chat
 * command (a regex trigger on this tool, fired from the request path before
 * the LLM) and the UI's Analyze button (which sends the same command through
 * the chat surface). The deterministic work (store I/O, the missing-docs
 * check, the recording rules) stays in code; the underwriting judgment runs
 * in the underwriting-reviewer subagent via ctx.callSubagent. Everything this
 * handler calls is declared in tool.json `uses`; undeclared calls fail closed.
 */
export default async function analyze_submission(
  params: AnalyzeSubmissionParams,
  ctx: CustomToolContext,
) {
  const submission_id = params.submission_id?.trim();
  if (!submission_id) {
    throw new Error("analyze_submission requires a submission_id.");
  }
  if (!ctx.callTool || !ctx.callSubagent) {
    throw new Error(
      "analyze_submission needs the composite context (ctx.callTool + ctx.callSubagent). " +
        "Check tool.json `uses` and that the calling path wires composition.",
    );
  }

  return runUnderwritingAnalysis(submission_id, {
    callTool: (name, args) => ctx.callTool!(name, args),
    callSubagent: (ref, task, input) => ctx.callSubagent!(ref, task, input),
    loadGuide: () => {
      if (!ctx.fs) {
        throw new Error(
          `ctx.fs is unavailable, so the underwriting guide (${GUIDE_PATH}) cannot be read for the reviewer.`,
        );
      }
      return ctx.fs.readRepoFile(GUIDE_PATH);
    },
    now: () => new Date(),
    sessionId: ctx.sessionId ?? "",
    trace: (line) => ctx.emitReasoning?.(line),
  });
}
