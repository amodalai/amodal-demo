export const EVENT_KINDS = [
  "seeded",
  "submitted",
  "resubmitted",
  "analyzed",
  "decided",
  "replied",
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export interface EventCtx {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  now?(): Date;
  /** The durable run's journaled random, so a replay reuses the first id. */
  random?(): number;
}

export interface NewEvent {
  submission_id: string;
  kind: EventKind;
  actor: string;
  summary: string;
  revision?: number | null;
  /** A caller-supplied id makes the append idempotent; seeding twice writes one row. */
  event_id?: string;
}

/** Append one row to the audit trail and return its id. */
export async function appendEvent(ctx: EventCtx, e: NewEvent): Promise<string> {
  const at = ctx.now ? ctx.now() : new Date();
  const random = ctx.random ? ctx.random() : Math.random();
  // Several appends of one kind can share an instant in one run, so the random
  // suffix is the only segment keeping their ids apart.
  const event_id =
    e.event_id ??
    `evt_${at.getTime()}_${e.kind}_${Math.floor(random * 36 ** 5)
      .toString(36)
      .padStart(5, "0")}`;
  await ctx.callTool("store__events__set", {
    key: event_id,
    value: {
      event_id,
      submission_id: e.submission_id,
      kind: e.kind,
      actor: e.actor,
      summary: e.summary,
      revision: e.revision ?? null,
      created_at: at.toISOString(),
    },
  });
  return event_id;
}

/** The slice of a tool's `CustomToolContext` an event write reads. */
interface ToolCtx {
  callTool?(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  random?(): number;
}

/**
 * The context for an event that accompanies a store row already stamped `atIso`,
 * so both carry the same instant. `random` stays bound to the runtime, which
 * implements the journaled primitives as methods on the context.
 */
export const eventCtx = (ctx: ToolCtx, atIso: string): EventCtx => ({
  callTool: (n, a) => ctx.callTool!(n, a),
  now: () => new Date(atIso),
  random: ctx.random ? () => ctx.random!() : undefined,
});

/** The stable id of a submission's seeding event, so reseeding does not duplicate it. */
export const seedEventId = (submission_id: string) => `evt_seed_${submission_id}`;
