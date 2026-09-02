import type { FindingRow, SubmissionRow } from "../types";

/**
 * The underwriter's actions on one submission. Shared by the pipeline table and
 * the detail screen so both offer exactly the same steps in the same order.
 */
export function SubmissionActions({
  s,
  finding,
  analyzing,
  error,
  onAnalyze,
  onDecide,
  onReply,
}: {
  s: SubmissionRow;
  finding?: FindingRow;
  analyzing: boolean;
  error?: string;
  onAnalyze: () => void;
  onDecide: () => void;
  onReply?: () => void;
}) {
  return (
    <>
      <div className="act__stack">
        <button className="btn" disabled={analyzing} onClick={onAnalyze}>
          {analyzing ? "Analyzing…" : s.analyzed_at ? "Re-analyze" : "Analyze"}
        </button>
        <button className="btn btn--ghost" disabled={analyzing} onClick={onDecide}>
          {s.decision ? "Re-decide" : "Decide"}
        </button>
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
