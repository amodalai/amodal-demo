/**
 * send-outcome: the Gmail connection's CONFIRM surface.
 *
 * The operator clicks "Send reply" on a triaged submission and confirms the
 * email in a modal. This replay intent loads the submission + its saved risk
 * finding, composes a broker reply from the recommendation (+ missing info /
 * conditions), and delivers it via the connection's `send_message` tool, then
 * records the outbound state on the submission.
 *
 * Sending mail to a real broker is irreversible, so unlike `sync-submissions`
 * (the read-only surface, which any intent may call freely) this NEVER runs
 * automatically. It fires only from the operator-confirmed UI action. The
 * `outbound-reply-guard` hook backstops it: no reply may be sent for an
 * un-triaged submission, whoever tries.
 *
 * Runs offline: with no `GMAIL_ACCESS_TOKEN`, the driver's dev outbox
 * (`GMAIL_DEV_OUTBOX`) captures the send, so the flow completes end-to-end.
 */
import { defineIntent } from "../../_types/replay-intent.js";

export interface SendOutcomeInput {
  submission_id: string;
  /** Optional operator note prepended to the reply body. */
  message?: string;
}

interface SubmissionRow {
  submission_id: string;
  applicant_name: string;
  broker_email?: string | null;
  [k: string]: unknown;
}

interface FindingRow {
  finding_id: string;
  submission_id: string;
  recommendation: string;
  risk_score: number;
  summary?: string;
  missing_info?: string[];
  conditions?: string[];
}

// send_message unwraps to the bare value on success, or { error, code }.
interface SendMessageResult {
  message_id?: string;
  thread_id?: string;
  error?: string;
  code?: string;
}

export default defineIntent<SendOutcomeInput>({
  id: "send-outcome",
  surface: {
    category: "communications",
    titleTemplate: "Send reply for {submission_id}",
    description:
      "Emails the triage outcome back to the broker (Gmail confirm surface). Runs only from the operator-confirmed Send reply action.",
    steps: [
      { id: "load", label: "Load submission + finding" },
      { id: "send", label: "Send the reply to the broker" },
      { id: "record", label: "Record the outbound reply" },
    ],
    permissionsSummary:
      "Reads submissions/risk_findings; sends broker email (Gmail); writes submissions.",
  },

  async handle(ctx) {
    const { submission_id, message } = ctx.input;
    if (!submission_id) {
      ctx.session.fail("No submission_id provided.");
      return;
    }

    ctx.session.advance("load");
    const sub = await ctx.callTool<SubmissionRow | undefined>(
      "store__submissions__get",
      {
        key: submission_id,
      },
    );
    if (!sub) {
      ctx.session.fail(`Submission ${submission_id} not found.`);
      return;
    }
    const finding = await ctx.callTool<FindingRow | undefined>(
      "store__risk_findings__get",
      {
        key: `find_${submission_id}`,
      },
    );
    if (!finding) {
      ctx.session.fail(
        `No finding for ${submission_id}. Analyze it before replying.`,
      );
      return;
    }
    const to = sub.broker_email?.trim();
    if (!to) {
      ctx.session.fail(`No broker email on file for ${submission_id}.`);
      return;
    }

    ctx.session.setTitle(`Reply to ${to} — ${finding.recommendation}`);
    // Keep the subject ASCII: the Gmail driver drops it into the raw mail
    // header without RFC 2047 encoding, so a non-ASCII char (e.g. an em dash)
    // mojibakes in the recipient's client. The body is charset-safe (base64
    // UTF-8), so em dashes there are fine.
    const subject = `Re: ${sub.applicant_name} - submission update`;
    const body = buildReply({ sub, finding, message });

    ctx.session.advance("send");
    const result = await ctx.callTool<SendMessageResult>("send_message", {
      to: [to],
      subject,
      body,
    });
    if (result?.error) {
      ctx.session.fail(`Send failed: ${result.error}`);
      return;
    }

    ctx.session.advance("record");
    const nowIso = ctx.now().toISOString();
    // store__set replaces the whole value, so re-emit the full row.
    await ctx.callTool("store__submissions__set", {
      key: submission_id,
      value: { ...sub, reply_status: "sent", replied_at: nowIso },
    });

    ctx.session.setMetadata({
      submission_id,
      to,
      recommendation: finding.recommendation,
      message_id: result?.message_id ?? null,
    });
    ctx.session.complete();
  },
});

const OPENING: Record<string, string> = {
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

function buildReply(opts: {
  sub: SubmissionRow;
  finding: FindingRow;
  message?: string;
}): string {
  const { sub, finding, message } = opts;
  const lines: string[] = [];
  lines.push(`Hello,`);
  lines.push("");
  lines.push(`Re: ${sub.applicant_name}`);
  lines.push("");
  if (message?.trim()) {
    lines.push(message.trim());
    lines.push("");
  }
  lines.push(
    OPENING[finding.recommendation] ??
      `Update on this submission: ${finding.recommendation}.`,
  );

  const missing = finding.missing_info ?? [];
  if (missing.length > 0) {
    lines.push("");
    lines.push("Still needed:");
    for (const m of missing) lines.push(`  - ${m}`);
  }
  const conditions = finding.conditions ?? [];
  if (conditions.length > 0) {
    lines.push("");
    lines.push("Conditions:");
    for (const c of conditions) lines.push(`  - ${c}`);
  }

  lines.push("");
  lines.push(
    "This is a workflow update only. It does not bind coverage or confirm pricing.",
  );
  lines.push("Reply with any questions.");
  lines.push("");
  lines.push("— Underwriting");
  return lines.join("\n");
}
