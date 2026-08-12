/**
 * ready-to-quote-guard: the underwriting review's one hard rule, enforced at the
 * platform layer for every writer.
 *
 * Step 3 put the rule in code INSIDE the analyze intent: a packet with a missing
 * required document is never `ready-to-quote`. But the chat agent holds rw store
 * tools, and any future intent could regress the rule. A hook sees and may block
 * EVERY tool call regardless of who made it, so it's the right place to make the
 * invariant true platform-wide, not just inside one handler.
 *
 * Fires on `preToolUse` for `store__submissions__set` / `store__risk_findings__set`.
 * When the row being written carries `recommendation: "ready-to-quote"`, it reads
 * that submission's documents and blocks the write if any required document isn't
 * `received`. Everything else passes straight through. Fail-closed: if the
 * documents read throws, the manifest's `failPolicy: "closed"` turns the failure
 * into a block.
 *
 * Shipped as `.mjs` so the runtime's hook loader (no on-demand esbuild, unlike
 * intents/tools) can import it directly. Exports `createHook(config) => {run}`.
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

      if (row.recommendation !== blockedRecommendation)
        return { action: "allow" };

      const submissionId =
        typeof row.submission_id === "string" ? row.submission_id : undefined;
      if (!submissionId || !ctx.store) {
        return {
          action: "block",
          reason:
            "Cannot verify required documents for this ready-to-quote write.",
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
        `ready-to-quote-guard: blocked ${toolName} for ${submissionId} (missing required docs: ${missing.join(", ")})`,
      );
      return {
        action: "block",
        reason:
          `${submissionId} cannot be ready-to-quote: required document(s) not received (${missing.join(", ")}).` +
          ` Resolve the missing documents or choose another recommendation.`,
      };
    },
  };
}
