import { useState } from "react";
import {
  DECISIONS,
  noteReason,
  quoteBlockedReason,
  statusFor,
  type Decision,
} from "../../amodal/_lib/decision";
import { DECISION_LABEL, type FindingRow, type SubmissionRow } from "../types";
import { Modal } from "./Modal";

/** What each decision does next, so the underwriter reads it before confirming. */
const CONSEQUENCE: Record<Decision, string> = {
  quote: "Closes the file and hands it to quoting. Nothing is bound or priced here.",
  "request-info": "Parks the file until the broker sends what is missing.",
  refer: "Closes the file and sends it to a senior underwriter.",
  decline: "Closes the file. No terms are offered.",
};

export function DecideModal({
  s,
  finding,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  s: SubmissionRow;
  finding?: FindingRow;
  busy: boolean;
  error?: string;
  onConfirm: (decision: Decision, note: string) => void;
  onCancel: () => void;
}) {
  const [decision, setDecision] = useState<Decision>("request-info");
  const [note, setNote] = useState("");

  // Imported from the same module the handler enforces, so the button cannot
  // promise something the tool will refuse.
  const blocked = quoteBlockedReason(decision, finding?.missing_info ?? []);
  const needsNote = noteReason(decision, s.recommendation);

  return (
    <Modal
      title={`Decide ${s.applicant_name}`}
      sub="The agent recommends; you decide. This is recorded against the submission and cannot be taken back from here."
      busy={busy}
      error={error}
      confirmLabel="Record decision"
      busyLabel="Recording…"
      confirmDisabled={Boolean(blocked) || (Boolean(needsNote) && !note.trim())}
      onConfirm={() => onConfirm(decision, note.trim())}
      onCancel={onCancel}
    >
      <div className="choices">
        {DECISIONS.map((d) => (
          <label key={d} className={`choice${decision === d ? " choice--on" : ""}`}>
            <input
              type="radio"
              name="decision"
              checked={decision === d}
              onChange={() => setDecision(d)}
            />
            <span className="choice__label">{DECISION_LABEL[d]}</span>
            <span className="choice__note">{CONSEQUENCE[d]}</span>
          </label>
        ))}
      </div>
      <p className="sub">
        Recommendation: {s.recommendation ?? "not analyzed"}. This decision sets the
        status to <code>{statusFor(decision)}</code>.
      </p>
      <label className="field">
        <span>Note{needsNote ? "" : " (optional)"}</span>
        <textarea
          rows={3}
          value={note}
          placeholder={needsNote ?? "Anything the file should record."}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {needsNote && !note.trim() ? <div className="banner">{needsNote}</div> : null}
      {blocked ? <div className="banner error">{blocked}</div> : null}
    </Modal>
  );
}
