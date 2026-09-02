import { previewReply, previewSubject } from "../reply";
import type { FindingRow, SubmissionRow } from "../types";
import { Modal } from "./Modal";

export function ReplyModal({
  s,
  finding,
  sending,
  error,
  onConfirm,
  onCancel,
}: {
  s: SubmissionRow;
  finding: FindingRow;
  sending: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title="Send reply to the broker"
      sub="This emails the triage outcome out via the Gmail connection: a real, irreversible send. Review it, then confirm."
      busy={sending}
      error={error}
      confirmLabel="Confirm & send"
      busyLabel="Sending…"
      confirmDisabled={!s.broker_email}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <dl className="modal__fields">
        <dt>To</dt>
        <dd>{s.broker_email ?? "—"}</dd>
        <dt>Subject</dt>
        <dd>{previewSubject(s)}</dd>
      </dl>
      <pre className="modal__body">{previewReply(s, finding)}</pre>
    </Modal>
  );
}
