/**
 * The rules a human decision has to satisfy. Pure and free of node-only
 * imports on purpose: the decide handler and the custom UI's modal both import
 * this file, so the button cannot disagree with what the tool enforces.
 */

export const DECISIONS = ["quote", "request-info", "refer", "decline"] as const;

export type Decision = (typeof DECISIONS)[number];

/** The recommendations under which quoting agrees with the agent. */
const QUOTABLE = new Set(["ready-to-quote", "quote-with-conditions"]);

/**
 * Why this decision needs a written note, or null when it does not. A decline
 * always needs one, and so does a quote the agent did not recommend, including
 * a quote on a submission nobody has analyzed.
 */
export function noteReason(
  decision: Decision,
  recommendation: string | null | undefined,
): string | null {
  if (decision === "decline") return "A note is required to decline this submission.";
  if (decision === "quote" && !QUOTABLE.has(recommendation ?? "")) {
    return "A note is required to quote against the agent's recommendation.";
  }
  return null;
}

/**
 * Why this decision is blocked outright, or null when it is allowed. The hard
 * rule: no quote while required information is outstanding. It mirrors the
 * clamp in runUnderwritingAnalysis, and the ready-to-quote-guard hook
 * backstops both.
 */
export function quoteBlockedReason(
  decision: Decision,
  missingInfo: readonly string[],
): string | null {
  if (decision !== "quote" || missingInfo.length === 0) return null;
  return `Cannot quote while information is outstanding: ${missingInfo.join("; ")}.`;
}

/** The workflow lane a decision moves the submission into. */
export function statusFor(decision: Decision): "info-requested" | "closed" {
  return decision === "request-info" ? "info-requested" : "closed";
}
