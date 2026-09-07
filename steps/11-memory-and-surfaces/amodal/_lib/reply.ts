import { DECISIONS } from "./decision.js";

interface ReplySubmission {
  applicant_name: string;
  decision?: unknown;
}

interface ReplyFinding {
  recommendation: string;
  missing_info?: readonly string[];
  conditions?: readonly string[];
}

const OPENING: Record<string, string> = {
  "ready-to-quote":
    "Good news: this submission meets our underwriting guidelines and we are ready to prepare a quote.",
  "quote-with-conditions":
    "We can move ahead with a quote, subject to the conditions below.",
  quote: "We are preparing a quote for this submission.",
  "request-info":
    "Before we can proceed, we need some additional information (listed below).",
  refer:
    "This submission needs a senior-underwriter review; we have referred it internally and will follow up.",
  decline:
    "After review, we are unable to offer terms on this submission at this time.",
};

export function replySubject(sub: ReplySubmission): string {
  // The Gmail driver's raw subject header has no RFC 2047 encoding.
  const applicantName = sub.applicant_name.replace(/[^\x00-\x7F]/g, "");
  return `Re: ${applicantName} - submission update`;
}

export function buildReply(sub: ReplySubmission, finding: ReplyFinding, message?: string) {
  const decision = DECISIONS.find((d) => d === sub.decision) ?? null;
  const conditions = !decision || decision === "quote" ? finding.conditions ?? [] : [];
  const missing = !decision || decision === "request-info" ? finding.missing_info ?? [] : [];
  const outcome = decision === "quote" && conditions.length > 0
    ? "quote-with-conditions"
    : decision ?? finding.recommendation;

  const lines = ["Hello,", "", `Re: ${sub.applicant_name}`, ""];
  if (message?.trim()) lines.push(message.trim(), "");
  lines.push(OPENING[outcome] ?? `Update on this submission: ${outcome}.`);
  if (missing.length) {
    lines.push("", "Still needed:");
    for (const item of missing) lines.push(`  - ${item}`);
  }
  if (conditions.length) {
    lines.push("", "Conditions:");
    for (const item of conditions) lines.push(`  - ${item}`);
  }
  lines.push(
    "",
    "This is a workflow update only. It does not bind coverage or confirm pricing.",
    "Reply with any questions.",
    "",
    "— Underwriting",
  );
  return { subject: replySubject(sub), body: lines.join("\n"), outcome, decision };
}
