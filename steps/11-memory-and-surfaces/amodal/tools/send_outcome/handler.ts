import type { CustomToolContext } from "../../_types/tool-context.js";
import { appendEvent } from "../../_lib/events.js";
import { findingKey, storeGetResult } from "../../_lib/underwriting-analysis.js";

/**
 * send_outcome: the Gmail connection's CONFIRM surface.
 *
 * The operator clicks "Send reply" on a triaged submission and confirms the
 * email in a modal. This durable tool (invoked via
 * POST /api/tools/send_outcome/run; the `invoke` trigger in tool.json is the
 * opt-in) loads the submission + its saved risk finding, composes a broker
 * reply from the recommendation (+ missing info / conditions), delivers it via
 * the connection's `send_message` tool, then records the outbound state on the
 * submission.
 *
 * Sending mail to a real broker is irreversible, so unlike `sync_submissions`
 * (the read-only surface) this NEVER runs automatically: it is not in any
 * agent's tools, so it fires only from the operator-confirmed UI action. The
 * `outbound-reply-guard` hook backstops the LLM paths: no reply may be sent
 * for an un-triaged submission, whoever tries.
 *
 * Runs offline: with no `GMAIL_ACCESS_TOKEN`, the driver's dev outbox
 * (`GMAIL_DEV_OUTBOX`) captures the send, so the flow completes end-to-end.
 *
 * The invoke lane does not validate a tool.json tool's `parameters` schema,
 * so this handler is defensive about its input.
 */

export interface SendOutcomeParams {
  submission_id?: string;
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

export default async function send_outcome(
  params: SendOutcomeParams,
  ctx: CustomToolContext,
) {
  const submission_id =
    typeof params.submission_id === "string" ? params.submission_id.trim() : "";
  const message = typeof params.message === "string" ? params.message : undefined;
  if (!submission_id) {
    throw new Error("No submission_id provided.");
  }
  if (!ctx.callTool) {
    throw new Error(
      "send_outcome needs the composite context (ctx.callTool). " +
        "Check tool.json `uses` and that the calling path wires composition.",
    );
  }

  const sub = storeGetResult<SubmissionRow>(
    await ctx.callTool("store__submissions__get", {
      key: submission_id,
    }),
  );
  if (!sub) {
    throw new Error(`Submission ${submission_id} not found.`);
  }
  const finding = storeGetResult<FindingRow>(
    await ctx.callTool("store__risk_findings__get", {
      key: findingKey(submission_id),
    }),
  );
  if (!finding) {
    throw new Error(
      `No finding for ${submission_id}. Analyze it before replying.`,
    );
  }
  const to = sub.broker_email?.trim();
  if (!to) {
    throw new Error(`No broker email on file for ${submission_id}.`);
  }

  // Keep the subject ASCII: the Gmail driver drops it into the raw mail
  // header without RFC 2047 encoding, so a non-ASCII char (e.g. an em dash)
  // mojibakes in the recipient's client. The body is charset-safe (base64
  // UTF-8), so em dashes there are fine.
  const applicantName = sub.applicant_name.replace(/[^\x00-\x7F]/g, "");
  const subject = `Re: ${applicantName} - submission update`;
  const body = buildReply({ sub, finding, message });

  const result = await ctx.callTool<SendMessageResult>("send_message", {
    to: [to],
    subject,
    body,
  });
  if (result?.error) {
    throw new Error(`Send failed: ${result.error}`);
  }

  const nowIso = new Date(ctx.now ? ctx.now() : Date.now()).toISOString();
  // store__set replaces the whole value, so re-emit the full row.
  await ctx.callTool("store__submissions__set", {
    key: submission_id,
    value: { ...sub, reply_status: "sent", replied_at: nowIso },
  });
  await appendEvent(
    {
      callTool: (n, a) => ctx.callTool!(n, a),
      now: () => new Date(nowIso),
      random: ctx.random,
    },
    {
      submission_id,
      kind: "replied",
      actor: "underwriter",
      summary: `Emailed the ${finding.recommendation} outcome to ${to}.`,
      revision: typeof sub.revision === "number" ? sub.revision : null,
    },
  );

  return {
    submission_id,
    to,
    recommendation: finding.recommendation,
    message_id: result?.message_id ?? null,
  };
}

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
