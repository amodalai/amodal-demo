import { StatusPill } from "../components/Pills";
import { BROKER } from "../persona";
import { shortTime, type SubmissionRow } from "../types";

/** The broker's own file list. No recommendation, no risk score: that is the underwriter's view. */
export function MySubmissions({
  submissions,
  onOpen,
}: {
  submissions: SubmissionRow[];
  onOpen: (submission_id: string) => void;
}) {
  return (
    <>
      <header className="screen__head">
        <div>
          <h2>My submissions</h2>
          <p className="sub">
            Everything filed by {BROKER.email}. Open one to see what the
            underwriter asked for.
          </p>
        </div>
      </header>

      {submissions.length === 0 ? (
        <div className="empty">
          <p>Nothing filed yet.</p>
          <p className="sub">File one from New submission and it comes back reviewed.</p>
        </div>
      ) : (
        <div className="grid-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Business</th>
                <th>Filed</th>
                <th>Revision</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <tr key={s.submission_id}>
                  <td>
                    <button className="link" onClick={() => onOpen(s.submission_id)}>
                      {s.applicant_name}
                    </button>
                    <div className="id">{s.submission_id}</div>
                  </td>
                  <td>{s.business_type}</td>
                  <td className="nowrap">{shortTime(s.created_at)}</td>
                  <td className="num">{s.revision ?? 1}</td>
                  <td>
                    <StatusPill s={s} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
