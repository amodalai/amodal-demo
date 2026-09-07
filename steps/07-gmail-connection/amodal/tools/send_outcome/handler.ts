import type { CustomToolContext } from "../../_types/tool-context.js";
import { updatedSubmission } from "../../_lib/demo-data.js";
import { buildReply } from "../../_lib/reply.js";
import { appendEvent, eventCtx } from "../../_lib/events.js";
import { findingKey, storeGetResult } from "../../_lib/underwriting-analysis.js";

/**
 * send_outcome: the Gmail connection's CONFIRM surface.
 *
 * The operator clicks "Send reply" on a triaged submission and confirms the
 * email in a modal. This durable tool (invoked via
 * POST /api/tools/send_outcome/run; the `invoke` trigger in tool.json is the
 * opt-in) loads the submission + its saved risk finding, composes a broker
 * reply from the human decision or, before a decision, the recommendation.
 * It delivers the email through `send_message` and records the outbound state
 * on the submission.
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

  const { subject, body, outcome, decision } = buildReply(sub, finding, message);

  const result = await ctx.callTool<SendMessageResult>("send_message", {
    to: [to],
    subject,
    body,
  });
  if (result?.error) {
    throw new Error(`Send failed: ${result.error}`);
  }

  const nowIso = new Date(ctx.now ? ctx.now() : Date.now()).toISOString();
  const updatedSub = updatedSubmission(sub, {
    reply_status: "sent",
    replied_at: nowIso,
  });
  await ctx.callTool("store__submissions__set", {
    key: submission_id,
    value: updatedSub,
  });
  await appendEvent(eventCtx(ctx, nowIso), {
    submission_id,
    kind: "replied",
    actor: "underwriter",
    summary: `Emailed the ${outcome} outcome to ${to}.`,
    revision: typeof updatedSub.revision === "number" ? updatedSub.revision : null,
  });

  return {
    submission_id,
    to,
    recommendation: finding.recommendation,
    outcome,
    decision,
    message_id: result?.message_id ?? null,
  };
}
