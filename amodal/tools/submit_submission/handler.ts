import type { CustomToolContext } from "../../_types/tool-context.js";
import { submitSubmission, type SubmitFields } from "../../_lib/submit.js";
import type { DocumentRow } from "../../_lib/underwriting-analysis.js";

const GUIDE_PATH = "amodal/knowledge/underwriting-guide.md";
const DOC_STATUSES = ["received", "requested", "missing"] as const;

/**
 * submit_submission: the broker's entry point, filing and review in one
 * durable run.
 *
 * The broker fills the form once and gets a reviewed submission back, rather
 * than filing and waiting for someone to press Analyze. Everything happens in
 * one run, so the review reads the rows this run holds in memory: a durable
 * run cannot read back its own uncommitted writes.
 *
 * In no agent's `tools` and with no regex trigger, like decide_submission: the
 * model does not file paperwork under a broker's name.
 *
 * The invoke lane does not validate a tool.json tool's `parameters` schema, so
 * this handler is defensive about its input.
 */
export default async function submit_submission(
  params: Partial<SubmitFields> & { documents?: unknown },
  ctx: CustomToolContext,
) {
  const applicant_name = str(params.applicant_name);
  const business_type = str(params.business_type);
  const requested_by = str(params.requested_by);
  if (!applicant_name) throw new Error("An applicant name is required.");
  if (!business_type) throw new Error("A business type is required.");
  if (!requested_by) throw new Error("A filing broker (requested_by) is required.");
  if (!ctx.callTool || !ctx.callSubagent) {
    throw new Error(
      "submit_submission needs the composite context (ctx.callTool + ctx.callSubagent). " +
        "Check tool.json `uses` and that the calling path wires composition.",
    );
  }

  return submitSubmission(
    {
      applicant_name,
      business_type,
      state: str(params.state) || null,
      property_value_usd: num(params.property_value_usd),
      annual_revenue_usd: num(params.annual_revenue_usd),
      broker_email: str(params.broker_email) || null,
      requested_by,
      documents: documentsOf(params.documents),
      submission_id: str(params.submission_id) || undefined,
    },
    {
      callTool: (name, args) => ctx.callTool!(name, args),
      callSubagent: (ref, task, input) => ctx.callSubagent!(ref, task, input),
      loadGuide: () => {
        if (!ctx.fs) {
          throw new Error(
            `ctx.fs is unavailable, so the underwriting guide (${GUIDE_PATH}) cannot be read for the reviewer.`,
          );
        }
        return ctx.fs.readRepoFile(GUIDE_PATH);
      },
      now: () => new Date(ctx.now ? ctx.now() : Date.now()),
      random: ctx.random ? () => ctx.random!() : undefined,
      sessionId: ctx.sessionId ?? "",
      trace: (line) => ctx.emitReasoning?.(line),
    },
  );
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function documentsOf(value: unknown): DocumentRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const d = raw as Partial<DocumentRow>;
    const name = str(d.name);
    if (!name) return [];
    const status = DOC_STATUSES.includes(d.status as DocumentRow["status"])
      ? (d.status as DocumentRow["status"])
      : "missing";
    return [{
      kind: str(d.kind) || "other",
      name,
      status,
      required: d.required === true,
      notes: str(d.notes) || null,
    }];
  });
}
