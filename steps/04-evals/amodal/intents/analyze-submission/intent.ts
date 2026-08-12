import type { IntentDefinition } from "../../_types/intent-context.js";
import {
  EXAMPLES,
  ensureExamplesSeeded,
  exampleRows,
} from "../../_lib/demo-data.js";

export interface AnalyzeSubmissionInput {
  submission_id?: string;
}

interface SubmissionRow {
  submission_id: string;
  applicant_name: string;
  business_type: string;
  state?: string | null;
  property_value_usd?: number | null;
  annual_revenue_usd?: number | null;
  [k: string]: unknown;
}

interface DocumentRow {
  kind: string;
  name: string;
  status: "received" | "requested" | "missing";
  required: boolean;
}

interface ClaimRow {
  year: number;
  description: string;
  amount_usd: number;
  open: boolean;
}

interface ReviewResult {
  recommendation: string;
  risk_score: number;
  summary: string;
  cards: Array<{ category: string; status: string; note: string }>;
  missing_info: string[];
  conditions: string[];
}

const RECS = new Set([
  "ready-to-quote",
  "quote-with-conditions",
  "request-info",
  "refer",
  "decline",
]);
function findMissingRequiredDocs(documents: DocumentRow[]): string[] {
  return documents
    .filter((d) => d.required && d.status !== "received")
    .map((d) => d.name);
}

function rows<T>(q: unknown): T[] {
  const docs = (q as { documents?: Array<{ payload: T }> }).documents;
  return (docs ?? []).map((d) => d.payload);
}

const intent: IntentDefinition<AnalyzeSubmissionInput> = {
  id: "analyze-submission",
  regex:
    /^\s*(?:analyze|triage|review|assess)\s+(?<submission_id>sub_[a-z0-9_]+)\s*$/i,

  async handle(ctx) {
    const submission_id =
      ctx.input?.submission_id ?? ctx.match?.groups?.["submission_id"];
    if (!submission_id) return null;

    let sub = (await ctx.callTool("store__submissions__get", {
      key: submission_id,
    })) as SubmissionRow | undefined;

    let documents: DocumentRow[];
    let claims: ClaimRow[];

    if (sub) {
      documents = rows<DocumentRow>(
        await ctx.callTool("store__documents__query", {
          where: { submission_id },
          limit: 200,
        }),
      );
      claims = rows<ClaimRow>(
        await ctx.callTool("store__claims__query", {
          where: { submission_id },
          limit: 200,
        }),
      );
    } else {
      const example = EXAMPLES.find((ex) => ex.submission_id === submission_id);
      if (!example) {
        ctx.emitText(
          `I couldn't find \`${submission_id}\` in the store, and it isn't ` +
            "one of the demo submissions. Check the id and try again.",
        );
        return {};
      }
      // Fresh stores. Seed them for later runs, and analyze the in-memory
      // example in this run: a run cannot read back its own uncommitted
      // writes, so the rows just seeded are not visible here yet.
      await ensureExamplesSeeded(ctx);
      const fallback = exampleRows(example, new Date().toISOString());
      sub = fallback.submission;
      documents = fallback.documents;
      claims = fallback.claims;
    }

    const missingRequiredDocs = findMissingRequiredDocs(documents);

    const { result: review } = await ctx.callSkill<ReviewResult>(
      "underwriting-review",
      {
        prompt:
          "Score this submission against the underwriting guide. Emit review cards, a missing-info list, suggested conditions, and a single recommendation. The required documents that are missing have already been determined in code and are given to you as `missing_required_documents`. Treat that list as fact and do not re-derive it. Do not bind coverage or price premium.",
        context: {
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
          })),
          claims: claims.map((c) => ({
            year: c.year,
            description: c.description,
            amount_usd: c.amount_usd,
            open: c.open,
          })),
        },
      },
    );

    if (!review)
      throw new Error("underwriting-review skill returned no structured result");

    const missingInfo = Array.from(
      new Set([...missingRequiredDocs, ...(review.missing_info ?? [])]),
    );

    let recommendation = RECS.has(review.recommendation)
      ? review.recommendation
      : "request-info";
    if (missingRequiredDocs.length > 0 && recommendation === "ready-to-quote") {
      recommendation = "request-info";
    }

    const riskScore = Number.isFinite(review.risk_score)
      ? Math.max(0, Math.min(100, Math.round(review.risk_score)))
      : 50;

    const nowIso = new Date().toISOString();
    const finding_id = `find_${submission_id}`;
    await ctx.callTool("store__risk_findings__set", {
      key: finding_id,
      value: {
        finding_id,
        submission_id,
        recommendation,
        risk_score: riskScore,
        summary: review.summary ?? "",
        cards: review.cards ?? [],
        missing_info: missingInfo,
        conditions: review.conditions ?? [],
        analyzer_session_id: ctx.sessionId,
        created_at: nowIso,
      },
    });

    await ctx.callTool("store__submissions__set", {
      key: submission_id,
      value: {
        ...sub,
        status: "in-review",
        recommendation,
        risk_score: riskScore,
        analyzed_at: nowIso,
      },
    });

    const lines = [
      `**${sub.applicant_name}** — ${recommendation} (risk ${riskScore}/100)`,
      review.summary?.trim() ? `\n${review.summary.trim()}` : "",
      missingInfo.length ? `\n**Missing info:** ${missingInfo.join("; ")}` : "",
      review.conditions?.length
        ? `\n**Conditions:** ${review.conditions.join("; ")}`
        : "",
      `\n_Saved as \`${finding_id}\`._`,
    ].filter(Boolean);
    ctx.emitText(lines.join("\n"));

    return {};
  },
};

export default intent;
