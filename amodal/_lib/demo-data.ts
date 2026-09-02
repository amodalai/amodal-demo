import { appendEvent, seedEventId } from "./events.js";
import { EXAMPLES, type Example } from "./examples.js";

export { EXAMPLES };

interface SeedCtx {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  now?(): Date;
}

export const NEW_SUBMISSION_DEFAULTS = {
  status: "new" as const,
  recommendation: null,
  risk_score: null,
  analyzed_at: null,
  reply_status: "not-sent" as const,
  replied_at: null,
  decision: null,
  decision_note: null,
  decided_at: null,
  decided_by: null,
  revision: 1,
};

/**
 * Every column that is nullable or defaulted, so a rewrite of a row written
 * before that column existed still satisfies the schema. `store__set`
 * replaces the whole value and rejects a row with a missing field, and the
 * tutorial's submissions schema grows step by step, so a store carried
 * across steps holds rows that predate the newer columns.
 */
const SUBMISSION_GAPS = {
  state: null,
  property_value_usd: null,
  annual_revenue_usd: null,
  broker_email: null,
  requested_by: null,
  ...NEW_SUBMISSION_DEFAULTS,
};

/** A stored row plus `patch`, with any column the row predates filled in. */
export function updatedSubmission(
  sub: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...SUBMISSION_GAPS, ...sub, ...patch };
}

function submissionRow(ex: Example, nowIso: string) {
  return {
    submission_id: ex.submission_id,
    applicant_name: ex.applicant_name,
    business_type: ex.business_type,
    state: ex.state ?? null,
    property_value_usd: ex.property_value_usd ?? null,
    annual_revenue_usd: ex.annual_revenue_usd ?? null,
    ...NEW_SUBMISSION_DEFAULTS,
    broker_email: ex.broker_email ?? null,
    requested_by: ex.broker_email ?? null,
    created_at: nowIso,
  };
}

/**
 * In-memory rows for one demo submission, shaped like what the seeder
 * writes. Used by `analyze` on fresh stores: a run cannot read back its own
 * uncommitted store writes, so it analyzes the example directly while
 * `ensureExamplesSeeded` commits the same rows for later runs.
 */
export function exampleRows(ex: Example, nowIso: string) {
  return {
    submission: submissionRow(ex, nowIso),
    documents: (ex.docs ?? []).map((d) => ({
      kind: d.kind,
      name: d.name,
      status: d.status,
      required: d.required,
      notes: d.notes ?? null,
    })),
    claims: (ex.claims ?? []).map((c) => ({
      year: c.year,
      description: c.description,
      amount_usd: c.amount_usd,
      open: c.open ?? false,
    })),
  };
}

/** The stores the demo owns, and the field each one is keyed by. */
export const STORE_KEYS = {
  submissions: "submission_id",
  documents: "document_id",
  claims: "claim_id",
  risk_findings: "finding_id",
  events: "event_id",
} as const;

/**
 * Write every demo submission (with its documents and claims) that is not
 * already in the stores. `assumeEmpty` skips the lookup: reset_demo removes
 * every row first and cannot read back its own removes.
 */
export async function ensureExamplesSeeded(
  ctx: SeedCtx,
  opts: { assumeEmpty?: boolean } = {},
): Promise<number> {
  const nowIso = (ctx.now ? ctx.now() : new Date()).toISOString();

  const existing = new Set<string>();
  if (!opts.assumeEmpty) {
    const existingQ = (await ctx.callTool("store__submissions__query", {
      limit: 1000,
    })) as {
      documents: Array<{ payload: { submission_id: string } }>;
    };
    for (const d of existingQ.documents ?? []) existing.add(d.payload.submission_id);
  }

  let seeded = 0;
  for (const ex of EXAMPLES) {
    if (existing.has(ex.submission_id)) continue;
    seeded += 1;

    const rows = exampleRows(ex, nowIso);

    await ctx.callTool("store__submissions__set", {
      key: ex.submission_id,
      value: rows.submission,
    });

    let i = 0;
    for (const d of rows.documents) {
      i += 1;
      const document_id = `${ex.submission_id}_doc_${i}`;
      await ctx.callTool("store__documents__set", {
        key: document_id,
        value: {
          document_id,
          submission_id: ex.submission_id,
          ...d,
          created_at: nowIso,
        },
      });
    }

    let c = 0;
    for (const cl of rows.claims) {
      c += 1;
      const claim_id = `${ex.submission_id}_claim_${c}`;
      await ctx.callTool("store__claims__set", {
        key: claim_id,
        value: {
          claim_id,
          submission_id: ex.submission_id,
          ...cl,
          created_at: nowIso,
        },
      });
    }

    await appendEvent(ctx, {
      submission_id: ex.submission_id,
      kind: "seeded",
      actor: "system",
      summary: `${ex.applicant_name} loaded from the demo dataset.`,
      event_id: seedEventId(ex.submission_id),
    });
  }

  return seeded;
}
