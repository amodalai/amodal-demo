import type { CustomToolContext } from "../../_types/tool-context.js";
import { appendEvent, eventCtx } from "../../_lib/events.js";
import {
  DECISIONS,
  noteReason,
  quoteBlockedReason,
  statusFor,
  type Decision,
} from "../../_lib/decision.js";
import {
  findingKey,
  storeGetResult,
  type SubmissionRow,
} from "../../_lib/underwriting-analysis.js";

/**
 * decide_submission: the one step in the workflow the model cannot take.
 *
 * The analyzer recommends a workflow status; this records what a person chose.
 * It is in no agent's `tools` and has no regex trigger, so the only way to
 * reach it is the direct-invoke lane behind the UI's Decide action. That is
 * the enforcement, not a prompt asking the model to hold back.
 *
 * The rules live in _lib/decision.ts, which the UI's modal imports too, so the
 * button and the tool cannot disagree. Every rejection happens before the
 * first store write: a refused decision leaves no trace on the submission.
 *
 * The invoke lane does not validate a tool.json tool's `parameters` schema, so
 * this handler is defensive about its input.
 */
export default async function decide_submission(
  params: { submission_id?: string; decision?: string; note?: string },
  ctx: CustomToolContext,
) {
  const submission_id =
    typeof params.submission_id === "string" ? params.submission_id.trim() : "";
  const decision = params.decision as Decision;
  const note = typeof params.note === "string" ? params.note.trim() : "";
  if (!submission_id) throw new Error("No submission_id provided.");
  if (!DECISIONS.includes(decision)) {
    throw new Error(`Unknown decision "${params.decision}". Expected one of ${DECISIONS.join(", ")}.`);
  }
  if (!ctx.callTool) {
    throw new Error(
      "decide_submission needs the composite context (ctx.callTool). " +
        "Check tool.json `uses` and that the calling path wires composition.",
    );
  }

  const sub = storeGetResult<SubmissionRow>(
    await ctx.callTool("store__submissions__get", { key: submission_id }),
  );
  if (!sub) throw new Error(`Submission ${submission_id} not found.`);

  const finding = storeGetResult<{ missing_info?: string[] }>(
    await ctx.callTool("store__risk_findings__get", { key: findingKey(submission_id) }),
  );
  const blocked = quoteBlockedReason(decision, finding?.missing_info ?? []);
  if (blocked) throw new Error(blocked);

  const needsNote = noteReason(decision, sub.recommendation as string | null);
  if (needsNote && !note) throw new Error(needsNote);

  const nowIso = new Date(ctx.now ? ctx.now() : Date.now()).toISOString();
  const status = statusFor(decision);
  // store__set replaces the whole value, so re-emit the full row.
  await ctx.callTool("store__submissions__set", {
    key: submission_id,
    value: {
      ...sub,
      status,
      decision,
      decision_note: note || null,
      decided_at: nowIso,
      decided_by: "underwriter",
    },
  });
  await appendEvent(eventCtx(ctx, nowIso), {
    submission_id,
    kind: "decided",
    actor: "underwriter",
    summary: `Decided ${decision}${note ? `: ${note}` : "."}`,
    revision: typeof sub.revision === "number" ? sub.revision : null,
  });

  return { submission_id, decision, status };
}
