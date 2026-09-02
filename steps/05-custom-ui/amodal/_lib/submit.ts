import { NEW_SUBMISSION_DEFAULTS } from "./demo-data.js";
import { appendEvent } from "./events.js";
import {
  rows,
  runUnderwritingAnalysis,
  storeGetResult,
  type AnalyzeDeps,
  type ClaimRow,
  type DocumentRow,
  type SubmissionRow,
} from "./underwriting-analysis.js";

export interface SubmitFields {
  applicant_name: string;
  business_type: string;
  state?: string | null;
  property_value_usd?: number | null;
  annual_revenue_usd?: number | null;
  broker_email?: string | null;
  /** The broker filing it. Also the actor on the event and the owner of the row. */
  requested_by: string;
  documents: DocumentRow[];
  /** Set on a resubmission: the packet is replaced and the revision bumped. */
  submission_id?: string;
}

export interface SubmitOutcome {
  submission_id: string;
  revision: number;
  recommendation?: string;
  risk_score?: number;
}

/**
 * File a submission and review it in the same durable run.
 *
 * The broker files once and gets an answer, instead of filing and then waiting
 * for an underwriter to press Analyze. The analysis works from the rows this
 * function just built rather than reading them back: a durable run cannot see
 * its own uncommitted writes.
 *
 * A failed analysis rethrows and leaves the submission filed at `status: "new"`
 * with no finding, which is the state the underwriter's Analyze button retries.
 * Losing the filing because the reviewer subagent timed out would be worse.
 */
export async function submitSubmission(
  fields: SubmitFields,
  deps: AnalyzeDeps,
): Promise<SubmitOutcome> {
  const nowIso = deps.now().toISOString();
  const resubmitting = Boolean(fields.submission_id);
  const submission_id = fields.submission_id ?? newId(fields.applicant_name, deps);

  const previous = resubmitting
    ? storeGetResult<SubmissionRow>(
        await deps.callTool("store__submissions__get", { key: submission_id }),
      )
    : undefined;
  if (resubmitting && !previous) {
    throw new Error(`Submission ${submission_id} not found.`);
  }
  const revision =
    typeof previous?.revision === "number" ? previous.revision + 1 : 1;

  const submission: SubmissionRow = {
    ...(previous ?? {}),
    submission_id,
    applicant_name: fields.applicant_name,
    business_type: fields.business_type,
    state: fields.state ?? null,
    property_value_usd: fields.property_value_usd ?? null,
    annual_revenue_usd: fields.annual_revenue_usd ?? null,
    ...NEW_SUBMISSION_DEFAULTS,
    requested_by: fields.requested_by,
    revision,
    created_at: previous?.created_at ?? nowIso,
  };
  await deps.callTool("store__submissions__set", { key: submission_id, value: submission });

  // The packet is replaced wholesale, so the old rows are removed rather than
  // overwritten by key: a shorter packet would otherwise leave stale documents
  // behind and the completeness check would read them.
  if (resubmitting) {
    const existing = rows<{ document_id: string }>(
      await deps.callTool("store__documents__query", {
        where: { submission_id },
        limit: 200,
      }),
    );
    for (const d of existing) {
      await deps.callTool("store__documents__remove", { key: d.document_id });
    }
  }
  const documents = fields.documents.map((d) => ({
    kind: d.kind,
    name: d.name,
    status: d.status,
    required: d.required,
    notes: d.notes ?? null,
  }));
  let i = 0;
  for (const d of documents) {
    i += 1;
    const document_id = `${submission_id}_doc_${i}`;
    await deps.callTool("store__documents__set", {
      key: document_id,
      value: { document_id, submission_id, ...d, created_at: nowIso },
    });
  }

  const claims = resubmitting
    ? rows<ClaimRow>(
        await deps.callTool("store__claims__query", { where: { submission_id }, limit: 200 }),
      )
    : [];

  await appendEvent(deps, {
    submission_id,
    kind: resubmitting ? "resubmitted" : "submitted",
    actor: fields.requested_by,
    summary: resubmitting
      ? `Resubmitted with ${documents.length} document(s).`
      : `Filed ${fields.applicant_name} with ${documents.length} document(s).`,
    revision,
  });

  const outcome = await runUnderwritingAnalysis(submission_id, deps, {
    preloaded: { submission, documents, claims },
  }).catch((err: unknown) => {
    throw new Error(
      `${fields.applicant_name} was filed as ${submission_id}, but the review failed: ` +
        `${err instanceof Error ? err.message : String(err)}. Analyze it again from the pipeline.`,
    );
  });

  return {
    submission_id,
    revision,
    recommendation: outcome.recommendation,
    risk_score: outcome.risk_score,
  };
}

function newId(applicant_name: string, deps: AnalyzeDeps): string {
  const slug =
    applicant_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "submission";
  const random = deps.random ? deps.random() : Math.random();
  const suffix = Math.floor(random * 36 ** 4)
    .toString(36)
    .padStart(4, "0");
  return `sub_${slug}_${suffix}`;
}
