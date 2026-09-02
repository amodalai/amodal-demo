import { RecPill } from "./Pills";
import type { FindingRow } from "../types";

/** The agent's finding, in full. Underwriter-only: brokers never see the score. */
export function FindingBody({ finding }: { finding?: FindingRow }) {
  if (!finding) {
    return <p className="sub">Not analyzed yet. Run Analyze to score this submission.</p>;
  }
  return (
    <div className="finding">
      <div className="finding__head">
        <RecPill rec={finding.recommendation} />
        <span className="score">
          Risk <strong>{finding.risk_score}</strong>/100
        </span>
      </div>
      {finding.summary ? <p>{finding.summary}</p> : null}
      {finding.cards?.length ? (
        <ul className="cards">
          {finding.cards.map((c) => (
            <li key={c.category} className={`card card--${c.status}`}>
              <span className="card__category">{c.category}</span>
              <span className="card__status">{c.status}</span>
              <span className="card__note">{c.note}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <Bullets title="Missing information" items={finding.missing_info} />
      <Bullets title="Suggested conditions" items={finding.conditions} />
    </div>
  );
}

function Bullets({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <>
      <h4>{title}</h4>
      <ul className="missing-list">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </>
  );
}
