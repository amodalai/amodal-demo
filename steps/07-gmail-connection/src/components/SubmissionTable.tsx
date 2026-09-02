import { DecisionPill, RecPill } from "./Pills";
import { SubmissionActions } from "./SubmissionActions";
import type { SubmissionActionsApi } from "../actions";
import type { FindingRow, SubmissionRow } from "../types";

export function SubmissionTable({
  submissions,
  findingBySub,
  actions,
  onOpen,
  onReply,
}: {
  submissions: SubmissionRow[];
  findingBySub: Map<string, FindingRow>;
  actions: SubmissionActionsApi;
  onOpen: (submission_id: string) => void;
  onReply?: (s: SubmissionRow, finding: FindingRow) => void;
}) {
  return (
    <div className="grid-wrap">
      <table className="grid">
        <thead>
          <tr>
            <th>Applicant</th>
            <th>Business</th>
            <th>State</th>
            <th>Recommendation</th>
            <th className="num">Risk</th>
            <th>Decision</th>
            <th>Missing info</th>
            <th className="act"></th>
          </tr>
        </thead>
        <tbody>
          {submissions.map((s) => {
            const finding = findingBySub.get(s.submission_id);
            const claimsNote = finding?.cards?.find((c) => c.category === "claims")?.note?.trim();
            return (
              <tr key={s.submission_id}>
                <td>
                  <button className="link" onClick={() => onOpen(s.submission_id)}>
                    {s.applicant_name}
                  </button>
                  <div className="id" title={s.submission_id}>
                    {s.submission_id}
                  </div>
                  {s.broker_email ? (
                    <div className="id id--email" title={s.broker_email}>
                      {s.broker_email}
                    </div>
                  ) : null}
                </td>
                <td>{s.business_type}</td>
                <td>{s.state ?? "—"}</td>
                <td>
                  <RecPill rec={s.recommendation} />
                  {claimsNote ? <div className="claims-note">{claimsNote}</div> : null}
                </td>
                <td className="num">{s.risk_score ?? "—"}</td>
                <td>
                  <DecisionPill s={s} />
                </td>
                <td className="missing">
                  {finding?.missing_info?.length ? (
                    <ul className="missing-list">
                      {finding.missing_info.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="act">
                  <SubmissionActions
                    s={s}
                    finding={finding}
                    analyzing={actions.analyzing.has(s.submission_id)}
                    error={actions.errors.get(s.submission_id)}
                    onAnalyze={() => actions.analyze(s.submission_id)}
                    onDecide={() => actions.openDecide(s.submission_id)}
                    onReply={onReply && finding ? () => onReply(s, finding) : undefined}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
