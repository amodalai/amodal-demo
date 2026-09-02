import { useState } from "react";
import { DocumentsEditor, type DraftDocument } from "../components/DocumentsEditor";
import { BROKER } from "../persona";

export interface SubmissionDraft {
  applicant_name: string;
  business_type: string;
  state: string;
  property_value_usd: string;
  annual_revenue_usd: string;
  documents: DraftDocument[];
}

export const emptyDraft = (): SubmissionDraft => ({
  applicant_name: "",
  business_type: "",
  state: "",
  property_value_usd: "",
  annual_revenue_usd: "",
  documents: [
    { kind: "application", name: "Completed application", status: "received", required: true },
    { kind: "financials", name: "Last two years of financials", status: "missing", required: true },
  ],
});

/**
 * The broker's side of the demo. One submit runs `submit_submission`, which
 * files the packet and reviews it in the same durable run, so the broker gets
 * an answer instead of a receipt.
 */
export function NewSubmission({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error?: string;
  onSubmit: (draft: SubmissionDraft) => void;
}) {
  const [draft, setDraft] = useState(emptyDraft);
  const ready = draft.applicant_name.trim() && draft.business_type.trim();

  return (
    <>
      <header className="screen__head">
        <div>
          <h2>New submission</h2>
          <p className="sub">
            Filed as {BROKER.name} at {BROKER.firm}. Filing runs the review in the
            same durable run, so the outcome comes back with the receipt. Any
            required document that is not received becomes a missing-info item.
          </p>
        </div>
      </header>

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !busy) onSubmit(draft);
        }}
      >
        <Field label="Applicant" value={draft.applicant_name} onChange={(applicant_name) => setDraft({ ...draft, applicant_name })} />
        <Field label="Business type" value={draft.business_type} onChange={(business_type) => setDraft({ ...draft, business_type })} />
        <Field label="State" value={draft.state} onChange={(state) => setDraft({ ...draft, state })} />
        <Field label="Property value (USD)" value={draft.property_value_usd} onChange={(property_value_usd) => setDraft({ ...draft, property_value_usd })} />
        <Field label="Annual revenue (USD)" value={draft.annual_revenue_usd} onChange={(annual_revenue_usd) => setDraft({ ...draft, annual_revenue_usd })} />

        <h3>Document packet</h3>
        <DocumentsEditor
          documents={draft.documents}
          onChange={(documents) => setDraft({ ...draft, documents })}
        />

        {error ? <div className="banner error">{error}</div> : null}
        <div className="form__actions">
          <button className="btn" type="submit" disabled={busy || !ready}>
            {busy ? "Filing and reviewing…" : "File submission"}
          </button>
        </div>
      </form>
    </>
  );
}

export function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
