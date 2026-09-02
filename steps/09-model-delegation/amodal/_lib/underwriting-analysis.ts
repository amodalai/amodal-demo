import {
  EXAMPLES,
  ensureExamplesSeeded,
  exampleRows,
  updatedSubmission,
} from "./demo-data.js";
import { appendEvent } from "./events.js";

export interface SubmissionRow {
  submission_id: string;
  applicant_name: string;
  business_type: string;
  state?: string | null;
  property_value_usd?: number | null;
  annual_revenue_usd?: number | null;
  [k: string]: unknown;
}

export interface DocumentRow {
  kind: string;
  name: string;
  status: "received" | "requested" | "missing";
  required: boolean;
  notes?: string | null;
}

export interface ClaimRow {
  year: number;
  description: string;
  amount_usd: number;
  open: boolean;
}

export interface ReviewResult {
  recommendation: string;
  risk_score: number;
  summary: string;
  cards: Array<{ category: string; status: string; note: string }>;
  missing_info: string[];
  conditions: string[];
}

export function findingKey(submission_id: string): string {
  return `find_${submission_id}`;
}

export interface AnalyzeOutcome {
  found: boolean;
  submission_id: string;
  applicant_name?: string;
  recommendation?: string;
  risk_score?: number;
  summary?: string;
  cards?: Array<{ category: string; status: string; note: string }>;
  missing_info?: string[];
  conditions?: string[];
  finding_id?: string;
}

/** The subagent that holds the underwriting judgment (agents/underwriting-reviewer/). */
export const REVIEWER_SUBAGENT = "underwriting-reviewer";

export interface AnalyzeDeps {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  /** Run a declared subagent to completion and return its final text
   *  (the composite ctx.callSubagent). */
  callSubagent(ref: string, task: string, input?: unknown): Promise<string>;
  /** Full text of the underwriting guide. Subagents get only their own
   *  AGENT.md as prompt (knowledge files are not injected), so the caller
   *  loads the guide and this flow passes it to the reviewer as input. */
  loadGuide(): Promise<string>;
  now(): Date;
  /** The durable run's journaled random, used for the audit event's id. */
  random?(): number;
  sessionId: string;
  /** Optional reasoning-trace sink (ctx.emitReasoning). Each line must
   *  describe work that actually happened. */
  trace?(line: string): void;
}

const RECS = new Set([
  "ready-to-quote",
  "quote-with-conditions",
  "request-info",
  "refer",
  "decline",
]);

export function findMissingRequiredDocs(documents: DocumentRow[]): string[] {
  return documents
    .filter((d) => d.required && d.status !== "received")
    .map((d) => d.name);
}

export function rows<T>(q: unknown): T[] {
  const docs = (q as { documents?: Array<{ payload: T }> }).documents;
  return (docs ?? []).map((d) => d.payload);
}

/**
 * Unwrap a `store__*__get` result. The runtime returns `{error: "... not
 * found ..."}` for a missing key, not undefined, so a truthiness check on
 * the raw result takes the found path with a garbage row. Every get goes
 * through here.
 */
export function storeGetResult<T>(doc: unknown): T | undefined {
  if (!doc || typeof doc !== "object" || "error" in doc) return undefined;
  return doc as T;
}

/**
 * Parse the reviewer subagent's final text into a ReviewResult. The
 * AGENT.md contract is "reply with only the JSON object", but stay
 * defensive: strip code fences and any stray prose around the outermost
 * object before parsing.
 */
export function parseReviewResult(text: string): ReviewResult {
  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error(
      `underwriting-reviewer returned no JSON object: ${text.slice(0, 200)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch (err) {
    throw new Error(
      `underwriting-reviewer returned unparseable JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const r = parsed as Partial<ReviewResult>;
  if (typeof r.recommendation !== "string") {
    throw new Error(
      "underwriting-reviewer JSON is missing a string `recommendation`",
    );
  }
  return {
    recommendation: r.recommendation,
    risk_score: typeof r.risk_score === "number" ? r.risk_score : NaN,
    summary: typeof r.summary === "string" ? r.summary : "",
    cards: Array.isArray(r.cards) ? r.cards : [],
    missing_info: Array.isArray(r.missing_info) ? r.missing_info : [],
    conditions: Array.isArray(r.conditions) ? r.conditions : [],
  };
}

export interface AnalyzeOptions {
  /**
   * Rows the caller already holds, analysed instead of read back from the
   * stores. A durable run cannot see its own uncommitted writes, so a
   * submission filed and analysed in one run has to be analysed from memory.
   */
  preloaded?: LoadedSubmission;
}

interface LoadedSubmission {
  submission: SubmissionRow;
  documents: DocumentRow[];
  claims: ClaimRow[];
}

async function loadSubmission(
  submission_id: string,
  deps: AnalyzeDeps,
): Promise<LoadedSubmission | undefined> {
  const submission = storeGetResult<SubmissionRow>(
    await deps.callTool("store__submissions__get", { key: submission_id }),
  );
  if (submission) {
    return {
      submission,
      documents: rows<DocumentRow>(
        await deps.callTool("store__documents__query", {
          where: { submission_id },
          limit: 200,
        }),
      ),
      claims: rows<ClaimRow>(
        await deps.callTool("store__claims__query", {
          where: { submission_id },
          limit: 200,
        }),
      ),
    };
  }

  const example = EXAMPLES.find((ex) => ex.submission_id === submission_id);
  if (!example) return undefined;
  // Fresh stores. Seed them for later runs, and analyze the in-memory
  // example in this run: a run cannot read back its own uncommitted
  // writes, so the rows just seeded are not visible here yet.
  deps.trace?.(
    `\`${submission_id}\` not in the store; seeding the demo dataset and analyzing the in-memory example.`,
  );
  await ensureExamplesSeeded(deps);
  return exampleRows(example, deps.now().toISOString());
}

export async function runUnderwritingAnalysis(
  submission_id: string,
  deps: AnalyzeDeps,
  opts: AnalyzeOptions = {},
): Promise<AnalyzeOutcome> {
  const loaded = opts.preloaded ?? (await loadSubmission(submission_id, deps));
  if (!loaded) return { found: false, submission_id };
  const { submission: sub, documents, claims } = loaded;

  deps.trace?.(
    `Loaded ${sub.applicant_name}: ${documents.length} documents, ${claims.length} claims.`,
  );

  const missingRequiredDocs = findMissingRequiredDocs(documents);
  deps.trace?.(
    missingRequiredDocs.length > 0
      ? `Deterministic check: missing required documents: ${missingRequiredDocs.join("; ")}.`
      : "Deterministic check: the required document packet is complete.",
  );

  deps.trace?.(
    `Delegating the underwriting judgment to the ${REVIEWER_SUBAGENT} subagent.`,
  );
  const reviewText = await deps.callSubagent(REVIEWER_SUBAGENT, [
    "Score this submission against the underwriting guide (included in the context as `underwriting_guide`).",
    "Emit review cards, a missing-info list, suggested conditions, and a single recommendation.",
    "The required documents that are missing have already been determined in code and are given to you as `missing_required_documents`. Treat that list as fact and do not re-derive it.",
    "Do not bind coverage or price premium.",
  ].join(" "), {
    underwriting_guide: await deps.loadGuide(),
    missing_required_documents: missingRequiredDocs,
    submission: {
      applicant_name: sub.applicant_name,
      business_type: sub.business_type,
      state: sub.state ?? null,
      property_value_usd: sub.property_value_usd ?? null,
      annual_revenue_usd: sub.annual_revenue_usd ?? null,
    },
    documents: documents.map((d) => ({
      kind: d.kind,
      name: d.name,
      status: d.status,
      required: d.required,
      notes: d.notes ?? null,
    })),
    claims: claims.map((c) => ({
      year: c.year,
      description: c.description,
      amount_usd: c.amount_usd,
      open: c.open,
    })),
  });

  const review = parseReviewResult(reviewText);

  const missingInfo = Array.from(
    new Set([...missingRequiredDocs, ...review.missing_info]),
  );

  let recommendation = RECS.has(review.recommendation)
    ? review.recommendation
    : "request-info";
  if (missingRequiredDocs.length > 0 && recommendation === "ready-to-quote") {
    recommendation = "request-info";
  }
  if (recommendation !== review.recommendation) {
    deps.trace?.(
      `Code clamped the recommendation from \`${review.recommendation}\` to \`${recommendation}\`.`,
    );
  }

  const riskScore = Number.isFinite(review.risk_score)
    ? Math.max(0, Math.min(100, Math.round(review.risk_score)))
    : 50;

  const nowIso = deps.now().toISOString();
  const finding_id = findingKey(submission_id);
  await deps.callTool("store__risk_findings__set", {
    key: finding_id,
    value: {
      finding_id,
      submission_id,
      recommendation,
      risk_score: riskScore,
      summary: review.summary,
      cards: review.cards,
      missing_info: missingInfo,
      conditions: review.conditions,
      analyzer_session_id: deps.sessionId,
      created_at: nowIso,
    },
  });

  await deps.callTool("store__submissions__set", {
    key: submission_id,
    value: updatedSubmission(sub, {
      status: "in-review",
      recommendation,
      risk_score: riskScore,
      analyzed_at: nowIso,
    }),
  });
  await appendEvent(deps, {
    submission_id,
    kind: "analyzed",
    actor: "agent",
    summary: `Recommended ${recommendation} at risk ${riskScore}/100.`,
    revision: typeof sub.revision === "number" ? sub.revision : null,
  });
  deps.trace?.(
    `Saved \`${finding_id}\` (${recommendation}, risk ${riskScore}/100) and stamped the submission.`,
  );

  return {
    found: true,
    submission_id,
    applicant_name: sub.applicant_name,
    recommendation,
    risk_score: riskScore,
    summary: review.summary,
    cards: review.cards,
    missing_info: missingInfo,
    conditions: review.conditions,
    finding_id,
  };
}
