/**
 * Checks model-selected send_message calls against the recipient's triage.
 * The send_outcome handler checks its own saved finding and recipient;
 * its nested send does not enter preToolUse. Failed reads block through
 * failPolicy.
 *
 * @typedef {{ toolName: string, args: Record<string, unknown> }} PreToolUsePayload
 * @typedef {{ get(store: string, key: string): Promise<Record<string, unknown> | null>,
 *             query(store: string, filter?: Record<string, unknown>): Promise<Array<Record<string, unknown>>> }} HookStoreReader
 * @typedef {{ store?: HookStoreReader, log(message: string): void }} HookContext
 * @typedef {{ action: 'allow' } | { action: 'block', reason: string }} HookDecision
 */

/**
 * @param {Record<string, unknown>} config
 */
export function createHook(config) {
  const guardedTools = Array.isArray(config.guardedTools)
    ? config.guardedTools
    : ["send_message"];

  return {
    /**
     * @param {string} point
     * @param {PreToolUsePayload} payload
     * @param {HookContext} ctx
     * @returns {Promise<HookDecision>}
     */
    async run(point, payload, ctx) {
      if (point !== "preToolUse") return { action: "allow" };
      const toolName = (payload && payload.toolName) || "";
      if (!guardedTools.includes(toolName)) return { action: "allow" };

      const args =
        payload.args && typeof payload.args === "object" ? payload.args : {};
      const recipients = normalizeRecipients(args.to);
      if (recipients.length === 0 || !ctx.store) {
        return {
          action: "block",
          reason: "Cannot verify the recipient for this outbound reply.",
        };
      }

      // An unknown recipient (no matching submission) is not a submission
      // reply, so it passes through.
      for (const email of recipients) {
        const subs = await ctx.store.query("submissions", {
          broker_email: email,
        });
        if (!subs || subs.length === 0) continue;

        let anyTriaged = false;
        for (const sub of subs) {
          const submissionId =
            typeof sub.submission_id === "string"
              ? sub.submission_id
              : undefined;
          if (!submissionId) continue;
          const finding = await ctx.store.get(
            "risk_findings",
            `find_${submissionId}`,
          );
          if (finding) {
            anyTriaged = true;
            break;
          }
        }

        if (!anyTriaged) {
          ctx.log(
            `outbound-reply-guard: blocked ${toolName} to ${email} (no triaged submission)`,
          );
          return {
            action: "block",
            reason:
              `Cannot email ${email}: their submission hasn't been analyzed yet. ` +
              `Triage it first, then send the reply.`,
          };
        }
      }

      return { action: "allow" };
    },
  };
}

/** send_message's `to` may be a string or an array; return lowercased addresses. */
function normalizeRecipients(to) {
  const list = Array.isArray(to) ? to : typeof to === "string" ? [to] : [];
  return list
    .filter((t) => typeof t === "string")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}
