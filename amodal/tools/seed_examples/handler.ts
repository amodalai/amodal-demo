import type { CustomToolContext } from "../../_types/tool-context.js";
import { ensureExamplesSeeded, EXAMPLES } from "../../_lib/demo-data.js";

/**
 * Composite tool behind the `seed` chat command (a regex trigger on this
 * tool, fired from the request path before the LLM). Same idempotent seeding
 * as the offline Sync-inbox fallback; the store tools it uses are declared
 * in tool.json `uses.tools`.
 */
export default async function seed_examples(
  _params: Record<string, never>,
  ctx: CustomToolContext,
) {
  if (!ctx.callTool) {
    throw new Error(
      "seed_examples needs the composite context (ctx.callTool). " +
        "Check tool.json `uses` and that the calling path wires composition.",
    );
  }

  const seeded = await ensureExamplesSeeded({
    callTool: (name, args) => ctx.callTool!(name, args),
  });
  ctx.emitReasoning?.(
    seeded > 0
      ? `Seeded ${seeded} demo submission(s); the rest were already in the store.`
      : "All demo submissions were already in the store; nothing to seed.",
  );

  const hint = `Triage one with e.g. \`analyze ${EXAMPLES[0].submission_id}\`.`;

  return {
    seeded,
    total: EXAMPLES.length,
    message:
      (seeded > 0
        ? `Loaded ${seeded} demo submission${seeded === 1 ? "" : "s"} into the stores. `
        : `All ${EXAMPLES.length} demo submissions are already loaded. `) + hint,
  };
}
