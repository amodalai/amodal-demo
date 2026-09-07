/**
 * Checks required documents before a model-selected quote or ready-to-quote
 * write. Authored handlers enforce this rule themselves: their nested store
 * calls do not enter preToolUse. Failed reads block through failPolicy.
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
    : ["store__submissions__set", "store__risk_findings__set"];
  const blockedRecommendation =
    typeof config.blockedRecommendation === "string"
      ? config.blockedRecommendation
      : "ready-to-quote";
  const blockedDecision =
    typeof config.blockedDecision === "string" ? config.blockedDecision : "quote";

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

      const value =
        payload.args && typeof payload.args === "object"
          ? /** @type {Record<string, unknown>} */ (payload.args).value
          : undefined;
      const row = value && typeof value === "object" ? value : undefined;
      if (!row) return { action: "allow" };

      const claim =
        row.recommendation === blockedRecommendation
          ? `be ${blockedRecommendation}`
          : row.decision === blockedDecision
            ? `be quoted`
            : undefined;
      if (!claim) return { action: "allow" };

      const submissionId =
        typeof row.submission_id === "string" ? row.submission_id : undefined;
      if (!submissionId || !ctx.store) {
        return {
          action: "block",
          reason: `Cannot verify required documents for this write claiming to ${claim}.`,
        };
      }

      const documents = await ctx.store.query("documents", {
        submission_id: submissionId,
      });
      const missing = (documents ?? [])
        .filter((d) => d && d.required === true && d.status !== "received")
        .map((d) => (typeof d.name === "string" ? d.name : d.document_id));

      if (missing.length === 0) return { action: "allow" };

      ctx.log(
        `ready-to-quote-guard: blocked ${toolName} for ${submissionId} (${claim}; missing required docs: ${missing.join(", ")})`,
      );
      return {
        action: "block",
        reason:
          `${submissionId} cannot ${claim}: required document(s) not received (${missing.join(", ")}).` +
          ` Resolve the missing documents or choose another outcome.`,
      };
    },
  };
}
