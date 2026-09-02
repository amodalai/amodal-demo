import { SubmissionTable } from "../components/SubmissionTable";
import type { SubmissionActionsApi } from "../actions";
import type { FindingRow, SubmissionRow } from "../types";

export function Pipeline({
  submissions,
  findingBySub,
  actions,
  onOpen,
  onReply,
  loading,
}: {
  submissions: SubmissionRow[];
  findingBySub: Map<string, FindingRow>;
  actions: SubmissionActionsApi;
  onOpen: (submission_id: string) => void;
  onReply?: (s: SubmissionRow, finding: FindingRow) => void;
  loading: string | null;
}) {
  const pending = submissions.filter(
    (s) => !s.analyzed_at && !actions.analyzing.has(s.submission_id),
  );

  return (
    <>
      <header className="screen__head">
        <div>
          <h2>Pipeline</h2>
          <p className="sub">
            Every submission on the desk. <em>Analyze</em> scores one against the
            underwriting guide; <em>Decide</em> records your call. The agent
            recommends a workflow status. It never binds coverage, prices premium,
            or gives legal advice.
          </p>
        </div>
        <button
          className="btn"
          disabled={pending.length === 0}
          onClick={() => pending.forEach((s) => actions.analyze(s.submission_id))}
        >
          {actions.analyzing.size > 0
            ? `Analyzing ${actions.analyzing.size}…`
            : `Analyze all${pending.length ? ` (${pending.length})` : ""}`}
        </button>
      </header>

      {submissions.length === 0 ? (
        <div className="empty">
          <p>{loading ?? "No submissions on this desk yet."}</p>
          {loading ? null : (
            <p className="sub">
              The demo dataset loads itself the first time a desk opens. Use{" "}
              <strong>Reset demo data</strong> to load it again.
            </p>
          )}
        </div>
      ) : (
        <SubmissionTable
          submissions={submissions}
          findingBySub={findingBySub}
          actions={actions}
          onOpen={onOpen}
          onReply={onReply}
        />
      )}
    </>
  );
}
