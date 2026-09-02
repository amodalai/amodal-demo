import { DECISION_LABEL, REC_LABEL, brokerStatus, type SubmissionRow } from "../types";

export function RecPill({ rec }: { rec?: string | null }) {
  if (!rec) return <span className="pill muted">Not analyzed</span>;
  return <span className={`pill rec-${rec}`}>{REC_LABEL[rec] ?? rec}</span>;
}

export function DecisionPill({ s }: { s: SubmissionRow }) {
  if (!s.decision) return <span className="pill muted">Undecided</span>;
  return <span className={`pill dec-${s.decision}`}>{DECISION_LABEL[s.decision]}</span>;
}

/** The broker's vocabulary: workflow state only, no recommendation, no score. */
export function StatusPill({ s }: { s: SubmissionRow }) {
  return <span className={`pill status-${s.decision ?? s.status ?? "new"}`}>{brokerStatus(s)}</span>;
}
