import type { DocumentRow } from "../types";

export type DraftDocument = Pick<DocumentRow, "kind" | "name" | "status" | "required">;

const KINDS = [
  "application",
  "financials",
  "property-details",
  "photos",
  "inspection",
  "claims-history",
  "other",
];

const STATUSES: DraftDocument["status"][] = ["received", "requested", "missing"];

/** The packet a broker files. A required document that is not received becomes a missing-info item. */
export function DocumentsEditor({
  documents,
  onChange,
}: {
  documents: DraftDocument[];
  onChange: (next: DraftDocument[]) => void;
}) {
  const update = (i: number, patch: Partial<DraftDocument>) =>
    onChange(documents.map((d, j) => (i === j ? { ...d, ...patch } : d)));

  return (
    <div className="docs">
      {documents.map((d, i) => (
        <div className="docs__row" key={i}>
          <select value={d.kind} onChange={(e) => update(i, { kind: e.target.value })}>
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input
            value={d.name}
            placeholder="Document name"
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <select
            value={d.status}
            onChange={(e) => update(i, { status: e.target.value as DraftDocument["status"] })}
          >
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <label className="docs__required">
            <input
              type="checkbox"
              checked={d.required}
              onChange={(e) => update(i, { required: e.target.checked })}
            />
            required
          </label>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onChange(documents.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() =>
          onChange([...documents, { kind: "other", name: "", status: "missing", required: false }])
        }
      >
        Add document
      </button>
    </div>
  );
}
