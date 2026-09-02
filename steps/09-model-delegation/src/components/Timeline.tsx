import { EVENT_LABEL, shortTime, type EventRow } from "../types";

/** The append-only trail from the events store, oldest first. */
export function Timeline({ events }: { events: EventRow[] }) {
  const ordered = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (ordered.length === 0) return <p className="sub">Nothing recorded yet.</p>;
  return (
    <ol className="timeline">
      {ordered.map((e) => (
        <li key={e.event_id} className={`timeline__item timeline__item--${e.kind}`}>
          <span className="timeline__kind">{EVENT_LABEL[e.kind] ?? e.kind}</span>
          <span className="timeline__summary">{e.summary}</span>
          <span className="timeline__meta">
            {e.actor} · {shortTime(e.created_at)}
            {e.revision ? ` · rev ${e.revision}` : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}
