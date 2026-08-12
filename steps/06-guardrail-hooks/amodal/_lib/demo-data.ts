import { EXAMPLES, type Example } from "./examples.js";

export { EXAMPLES };

interface SeedCtx {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

function submissionRow(ex: Example, nowIso: string) {
  return {
    submission_id: ex.submission_id,
    applicant_name: ex.applicant_name,
    business_type: ex.business_type,
    state: ex.state ?? null,
    property_value_usd: ex.property_value_usd ?? null,
    annual_revenue_usd: ex.annual_revenue_usd ?? null,
    status: "new",
    recommendation: null,
    risk_score: null,
    analyzed_at: null,
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

export async function ensureExamplesSeeded(ctx: SeedCtx): Promise<number> {
  const nowIso = new Date().toISOString();

  let existing: Set<string>;
  try {
    const existingQ = (await ctx.callTool("store__submissions__query", {
      limit: 1000,
    })) as {
      documents: Array<{ payload: { submission_id: string } }>;
    };
    existing = new Set(
      (existingQ.documents ?? []).map((d) => d.payload.submission_id),
    );
  } catch {
    existing = new Set();
  }

  let seeded = 0;
  for (const ex of EXAMPLES) {
    if (existing.has(ex.submission_id)) continue;
    seeded += 1;

    await ctx.callTool("store__submissions__set", {
      key: ex.submission_id,
      value: submissionRow(ex, nowIso),
    });

    let i = 0;
    for (const d of ex.docs ?? []) {
      i += 1;
      const document_id = `${ex.submission_id}_doc_${i}`;
      await ctx.callTool("store__documents__set", {
        key: document_id,
        value: {
          document_id,
          submission_id: ex.submission_id,
          kind: d.kind,
          name: d.name,
          status: d.status,
          required: d.required,
          notes: d.notes ?? null,
          created_at: nowIso,
        },
      });
    }

    let c = 0;
    for (const cl of ex.claims ?? []) {
      c += 1;
      const claim_id = `${ex.submission_id}_claim_${c}`;
      await ctx.callTool("store__claims__set", {
        key: claim_id,
        value: {
          claim_id,
          submission_id: ex.submission_id,
          year: cl.year,
          description: cl.description,
          amount_usd: cl.amount_usd,
          open: cl.open ?? false,
          created_at: nowIso,
        },
      });
    }
  }

  return seeded;
}
