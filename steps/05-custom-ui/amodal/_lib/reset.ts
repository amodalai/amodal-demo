import { STORE_KEYS, ensureExamplesSeeded } from "./demo-data.js";
import { rows } from "./underwriting-analysis.js";

interface ResetCtx {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  now?(): Date;
}

/**
 * Empty the four stores and seed them again. The seed runs blind
 * (`assumeEmpty`) because the removes are not visible in this run.
 */
export async function resetDemo(ctx: ResetCtx) {
  const removed = {} as Record<keyof typeof STORE_KEYS, number>;
  for (const [store, field] of Object.entries(STORE_KEYS)) {
    const docs = rows<Record<string, unknown>>(
      await ctx.callTool(`store__${store}__list`, { limit: 1000 }),
    );
    for (const d of docs) await ctx.callTool(`store__${store}__remove`, { key: d[field] });
    removed[store as keyof typeof STORE_KEYS] = docs.length;
  }
  const seeded = await ensureExamplesSeeded(ctx, { assumeEmpty: true });
  return { removed, seeded };
}
