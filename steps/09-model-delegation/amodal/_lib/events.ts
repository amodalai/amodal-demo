export const EVENT_KINDS = [
  "seeded",
  "submitted",
  "resubmitted",
  "analyzed",
  "decided",
  "replied",
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

interface EventCtx {
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
  const event_id =
    e.event_id ??
    `evt_${at.getTime()}_${Math.floor(random * 36 ** 5)
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

/** The stable id of a submission's seeding event, so reseeding does not duplicate it. */
export const seedEventId = (submission_id: string) => `evt_seed_${submission_id}`;
