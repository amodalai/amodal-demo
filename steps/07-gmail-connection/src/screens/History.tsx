import { useState } from "react";
import { EVENT_LABEL, byId, shortTime, type EventRow, type SubmissionRow } from "../types";

const CHIPS = ["all", "submitted", "analyzed", "decided", "replied", "seeded"] as const;

const MATCHES: Record<(typeof CHIPS)[number], (kind: string) => boolean> = {
  all: () => true,
  submitted: (k) => k === "submitted" || k === "resubmitted",
  analyzed: (k) => k === "analyzed",
  decided: (k) => k === "decided",
  replied: (k) => k === "replied",
  seeded: (k) => k === "seeded",
};

/** The whole desk's audit trail, newest first. Filtering is client-side over rows already loaded. */
export function History({
  events,
  submissions,
  onOpen,
}: {
  events: EventRow[];
  submissions: SubmissionRow[];
  onOpen: (submission_id: string) => void;
}) {
  const [chip, setChip] = useState<(typeof CHIPS)[number]>("all");
  const [text, setText] = useState("");
  const subs = byId(submissions);

  const needle = text.trim().toLowerCase();
  const shown = events
    .filter((e) => MATCHES[chip](e.kind))
    .filter((e) => {
      if (!needle) return true;
      const name = subs.get(e.submission_id)?.applicant_name ?? "";
      return (
        e.submission_id.toLowerCase().includes(needle) || name.toLowerCase().includes(needle)
      );
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <>
      <header className="screen__head">
        <div>
          <h2>History</h2>
          <p className="sub">
            Every step recorded against a submission, and who took it. The stores
            hold current state; this is the trail that survives the next write.
          </p>
        </div>
      </header>

      <div className="filters">
        <div className="chips">
          {CHIPS.map((c) => (
            <button
              key={c}
              className={`chip${chip === c ? " chip--on" : ""}`}
              onClick={() => setChip(c)}
            >
              {c === "all" ? "All" : (EVENT_LABEL[c] ?? c)}
            </button>
          ))}
        </div>
        <input
          className="filter"
          value={text}
          placeholder="Filter by applicant or submission id"
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <p>Nothing recorded yet.</p>
        </div>
      ) : (
        <div className="grid-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>When</th>
                <th>Submission</th>
                <th>Event</th>
                <th>Actor</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.event_id}>
                  <td className="nowrap">{shortTime(e.created_at)}</td>
                  <td>
                    <button className="link" onClick={() => onOpen(e.submission_id)}>
                      {subs.get(e.submission_id)?.applicant_name ?? e.submission_id}
                    </button>
                    <div className="id">{e.submission_id}</div>
                  </td>
                  <td>
                    <span className={`pill evt-${e.kind}`}>{EVENT_LABEL[e.kind] ?? e.kind}</span>
                  </td>
                  <td>{e.actor}</td>
                  <td>{e.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
