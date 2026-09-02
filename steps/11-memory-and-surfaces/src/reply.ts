import type { FindingRow, SubmissionRow } from "./types";

// Client-side preview of what `send_outcome` will email, so the confirm modal
// shows the operator the real message before they approve it. Mirrors the
// tool's buildReply (amodal/tools/send_outcome/handler.ts) closely enough to
// confirm against; the tool stays the source of truth for what actually sends.
const REPLY_OPENING: Record<string, string> = {
  "ready-to-quote":
    "Good news: this submission meets our underwriting guidelines and we are ready to prepare a quote.",
  "quote-with-conditions":
    "We can move ahead with a quote, subject to the conditions below.",
  "request-info":
    "Before we can proceed, we need some additional information (listed below).",
  refer:
    "This submission needs a senior-underwriter review; we have referred it internally and will follow up.",
  decline:
    "After review, we are unable to offer terms on this submission at this time.",
};

export function previewSubject(s: SubmissionRow): string {
  const applicantName = s.applicant_name.replace(/[^\x00-\x7F]/g, "");
  return `Re: ${applicantName} - submission update`;
}

export function previewReply(s: SubmissionRow, finding: FindingRow): string {
  const lines: string[] = ["Hello,", "", `Re: ${s.applicant_name}`, ""];
  lines.push(
    REPLY_OPENING[finding.recommendation] ??
      `Update on this submission: ${finding.recommendation}.`,
  );
  if (finding.missing_info?.length) {
    lines.push("", "Still needed:");
    for (const m of finding.missing_info) lines.push(`  - ${m}`);
  }
  if (finding.conditions?.length) {
    lines.push("", "Conditions:");
    for (const c of finding.conditions) lines.push(`  - ${c}`);
  }
  lines.push(
    "",
    "This is a workflow update only. It does not bind coverage or confirm pricing.",
  );
  lines.push("Reply with any questions.", "", "— Underwriting");
  return lines.join("\n");
}
