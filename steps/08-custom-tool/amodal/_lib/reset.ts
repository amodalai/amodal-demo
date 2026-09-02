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
  const stores = [];
  for (const [store, field] of Object.entries(STORE_KEYS)) {
    const result = await ctx.callTool(`store__${store}__list`, { limit: 1000 });
    if ((result as { hasMore?: boolean }).hasMore) {
      throw new Error(`Cannot reset ${store}: store contains more than 1000 rows`);
    }
    stores.push({ store, field, docs: rows<Record<string, unknown>>(result) });
  }

  const removed = {} as Record<keyof typeof STORE_KEYS, number>;
  for (const { store, field, docs } of stores) {
    for (const d of docs) await ctx.callTool(`store__${store}__remove`, { key: d[field] });
    removed[store as keyof typeof STORE_KEYS] = docs.length;
  }
  const seeded = await ensureExamplesSeeded(ctx, { assumeEmpty: true });
  return { removed, seeded };
}
