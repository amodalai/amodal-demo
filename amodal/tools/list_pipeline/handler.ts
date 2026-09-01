import type { CustomToolContext } from "../../_types/tool-context.js";
import { rows } from "../../_lib/underwriting-analysis.js";

/**
 * list_pipeline: the scoped read behind the UI's submissions table.
 *
 * Step 12 partitions the stores by scope_id, and the runtime's direct store
 * REST reads (what useStoreQuery hits) read only the agent-level partition.
 * A desk's rows are visible only from inside a scoped run, so the UI fetches
 * its table through this durable invoke tool: the run carries the desk's
 * scope_id, the store tools read that partition, and the rows ride back on
 * the run result.
 */
export default async function list_pipeline(
  _params: Record<string, never>,
  ctx: CustomToolContext,
) {
  if (!ctx.callTool) {
    throw new Error(
      "list_pipeline needs the composite context (ctx.callTool). " +
        "Check tool.json `uses` and that the calling path wires composition.",
    );
  }

  const subsQ = await ctx.callTool("store__submissions__query", { limit: 200 });
  const findingsQ = await ctx.callTool("store__risk_findings__query", {
    limit: 200,
  });

  return { submissions: rows(subsQ), findings: rows(findingsQ) };
}
