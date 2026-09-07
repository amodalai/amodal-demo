import type { FindingRow, SubmissionRow } from "../types";

/**
 * The underwriter's actions on one submission. Shared by the pipeline table and
 * the detail screen so both offer exactly the same steps in the same order.
 */
export function SubmissionActions({
  s,
  finding,
  analyzing,
  active,
  error,
  onAnalyze,
  onDecide,
  onReply,
}: {
  s: SubmissionRow;
  finding?: FindingRow;
  analyzing: boolean;
  active?: boolean;
  error?: string;
  onAnalyze: () => void;
  onDecide: () => void;
  onReply?: () => void;
}) {
  if (analyzing) return (
    <span className="analysis-status" role="status">
      {active ? "Analyzing against the underwriting guide…" : "Queued for analysis…"}
    </span>
  );

  const decisionButton = (
    <button className={`btn${s.analyzed_at ? "" : " btn--ghost"}`} onClick={onDecide}>
      {s.decision ? "Re-decide" : "Decide"}
    </button>
  );

  return (
    <>
      <div className="act__stack">
        {s.analyzed_at ? decisionButton : null}
        <button className={`btn${s.analyzed_at ? " btn--ghost" : ""}`} onClick={onAnalyze}>
          {s.analyzed_at ? "Re-analyze" : "Analyze"}
        </button>
        {!s.analyzed_at ? decisionButton : null}
        {onReply && finding ? (
          s.reply_status === "sent" ? (
            <span className="pill sent">Replied</span>
          ) : (
            <button className="btn btn--ghost" onClick={onReply}>
              Send reply
            </button>
          )
        ) : null}
      </div>
      {error ? <div className="row-error">{error}</div> : null}
    </>
  );
}
