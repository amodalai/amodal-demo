import type { Decision } from "../amodal/_lib/decision";

export interface SubmissionRow {
  submission_id: string;
  applicant_name: string;
  business_type: string;
  state?: string | null;
  property_value_usd?: number | null;
  annual_revenue_usd?: number | null;
  status?: string;
  recommendation?: string | null;
  risk_score?: number | null;
  analyzed_at?: string | null;
  broker_email?: string | null;
  reply_status?: string | null;
  decision?: Decision | null;
  decision_note?: string | null;
  decided_at?: string | null;
  requested_by?: string | null;
  revision?: number | null;
  created_at?: string | null;
}

export interface DocumentRow {
  document_id: string;
  submission_id: string;
  kind: string;
  name: string;
  status: "received" | "requested" | "missing";
  required: boolean;
  notes?: string | null;
}

export interface FindingRow {
  finding_id: string;
  submission_id: string;
  recommendation: string;
  risk_score: number;
  summary: string;
  cards?: Array<{ category: string; status: string; note: string }>;
  missing_info: string[];
  conditions: string[];
}

export interface EventRow {
  event_id: string;
  submission_id: string;
  kind: string;
  actor: string;
  summary: string;
  revision?: number | null;
  created_at: string;
}

export interface Pipeline {
  submissions: SubmissionRow[];
  findings: FindingRow[];
  documents: DocumentRow[];
  events: EventRow[];
}

export const EMPTY_PIPELINE: Pipeline = {
  submissions: [],
  findings: [],
  documents: [],
  events: [],
};

/** What the agent recommended. The underwriter's vocabulary. */
export const REC_LABEL: Record<string, string> = {
  "ready-to-quote": "Ready to quote",
  "quote-with-conditions": "Quote w/ conditions",
  "request-info": "Request info",
  refer: "Refer",
  decline: "Decline",
};

/** What a human decided. Also the underwriter's vocabulary. */
export const DECISION_LABEL: Record<Decision, string> = {
  quote: "Quoted",
  "request-info": "Info requested",
  refer: "Referred",
  decline: "Declined",
};

/**
 * What the broker sees. Brokers get the workflow state of their file, never
 * the agent's recommendation or its risk score.
 */
export function brokerStatus(s: SubmissionRow): string {
  if (s.decision) {
    return {
      quote: "Quote in preparation",
      "request-info": "Information needed",
      refer: "Referred for senior review",
      decline: "Declined",
    }[s.decision];
  }
  return s.status === "in-review" ? "Under review" : "Received";
}

export const EVENT_LABEL: Record<string, string> = {
  seeded: "Loaded",
  submitted: "Filed",
  resubmitted: "Resubmitted",
  analyzed: "Analyzed",
  decided: "Decided",
  replied: "Replied",
};

export const byId = <T extends { submission_id: string }>(rows: T[]) => {
  const map = new Map<string, T>();
  for (const row of rows) map.set(row.submission_id, row);
  return map;
};

export const forSubmission = <T extends { submission_id: string }>(
  rows: T[],
  submission_id: string,
) => rows.filter((r) => r.submission_id === submission_id);

export const shortTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

export const usd = (n?: number | null) =>
  typeof n === "number" ? `$${n.toLocaleString()}` : "—";
