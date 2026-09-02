import type { CustomToolContext } from "../../_types/tool-context.js";
import { resetDemo } from "../../_lib/reset.js";

/**
 * reset_demo: empty the demo's stores and seed them again, in one durable run
 * (invoked via POST /api/tools/reset_demo/run). In no agent's tools: it runs
 * only from the UI's Reset demo data action, behind a confirm modal.
 */
export default async function reset_demo(
  _params: Record<string, never>,
  ctx: CustomToolContext,
) {
  if (!ctx.callTool) {
    throw new Error(
      "reset_demo needs the composite context (ctx.callTool). " +
        "Check tool.json `uses` and that the calling path wires composition.",
    );
  }
  return resetDemo({
    callTool: (name, args) => ctx.callTool!(name, args),
    now: () => new Date(ctx.now ? ctx.now() : Date.now()),
  });
}
