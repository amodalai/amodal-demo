import { useState } from "react";
import { FindingBody } from "../components/FindingBody";
import { StatusPill } from "../components/Pills";
import { SubmissionActions } from "../components/SubmissionActions";
import { Timeline } from "../components/Timeline";
import { DocumentsEditor, type DraftDocument } from "../components/DocumentsEditor";
import { Field, type SubmissionDraft } from "./NewSubmission";
import type { SubmissionActionsApi } from "../actions";
import type { DocumentRow, EventRow, FindingRow, SubmissionRow } from "../types";
import { shortTime, usd } from "../types";
import type { Role } from "../routes";

export function SubmissionDetail({
  role,
  s,
  finding,
  documents,
  events,
  actions,
  submitting,
  submitError,
  onResubmit,
  onReply,
}: {
  role: Role;
  s?: SubmissionRow;
  finding?: FindingRow;
  documents: DocumentRow[];
  events: EventRow[];
  actions: SubmissionActionsApi;
  submitting: boolean;
  submitError?: string;
  onResubmit: (draft: SubmissionDraft) => void;
  onReply?: (s: SubmissionRow, finding: FindingRow) => void;
}) {
  if (!s) {
    return (
      <div className="empty">
        <p>That submission is not on this desk.</p>
      </div>
    );
  }
  return role === "underwriter" ? (
    <UnderwriterView
      s={s}
      finding={finding}
      documents={documents}
      events={events}
      actions={actions}
      onReply={onReply}
    />
  ) : (
    <BrokerView
      s={s}
      finding={finding}
      documents={documents}
      submitting={submitting}
      submitError={submitError}
      onResubmit={onResubmit}
    />
  );
}

function Facts({ s }: { s: SubmissionRow }) {
  return (
    <dl className="facts">
      <dt>Business</dt>
      <dd>{s.business_type}</dd>
      <dt>State</dt>
      <dd>{s.state ?? "—"}</dd>
      <dt>Property value</dt>
      <dd>{usd(s.property_value_usd)}</dd>
      <dt>Annual revenue</dt>
      <dd>{usd(s.annual_revenue_usd)}</dd>
      <dt>Filed</dt>
      <dd>
        {shortTime(s.created_at)} · revision {s.revision ?? 1}
      </dd>
    </dl>
  );
}

function Packet({ documents }: { documents: DocumentRow[] }) {
  if (documents.length === 0) return <p className="sub">No documents on file.</p>;
  return (
    <ul className="packet">
      {documents.map((d) => (
        <li key={d.document_id} className={`packet__item packet__item--${d.status}`}>
          <span className="packet__name">{d.name}</span>
          <span className="packet__kind">{d.kind}</span>
          <span className="packet__status">{d.status}</span>
          {d.required ? <span className="packet__required">required</span> : null}
        </li>
      ))}
    </ul>
  );
}

function UnderwriterView({
  s,
  finding,
  documents,
  events,
  actions,
  onReply,
}: {
  s: SubmissionRow;
  finding?: FindingRow;
  documents: DocumentRow[];
  events: EventRow[];
  actions: SubmissionActionsApi;
  onReply?: (s: SubmissionRow, finding: FindingRow) => void;
}) {
  return (
    <>
      <header className="screen__head">
        <div>
          <h2>{s.applicant_name}</h2>
          <p className="sub">{s.submission_id}</p>
        </div>
        <SubmissionActions
          s={s}
          finding={finding}
          analyzing={actions.analyzing.has(s.submission_id)}
          error={actions.errors.get(s.submission_id)}
          onAnalyze={() => actions.analyze(s.submission_id)}
          onDecide={() => actions.openDecide(s.submission_id)}
          onReply={onReply && finding ? () => onReply(s, finding) : undefined}
        />
      </header>

      <div className="detail">
        <section>
          <h3>Submission</h3>
          <Facts s={s} />
          <h3>Document packet</h3>
          <Packet documents={documents} />
        </section>
        <section>
          <h3>Agent finding</h3>
          <FindingBody finding={finding} />
          {s.decision ? (
            <>
              <h3>Decision</h3>
              <p>
                <strong>{s.decision}</strong> · {shortTime(s.decided_at)}
              </p>
              {s.decision_note ? <p>{s.decision_note}</p> : null}
            </>
          ) : null}
        </section>
        <section>
          <h3>Timeline</h3>
          <Timeline events={events} />
        </section>
      </div>
    </>
  );
}

type PacketEdit = { submission_id: string; packet: DraftDocument[] };

/**
 * What the editor shows: the broker's own edits, or the filed packet until
 * they make one. The rows arrive a fetch after mount, so seeding editor state
 * on mount leaves a deep link or a reload holding an empty packet, and filing
 * that packet replaces the submission's documents with nothing. Pairing the
 * edit with its submission id also keeps one file's edits off the next.
 */
function packetFor(
  submission_id: string,
  documents: DocumentRow[],
  edit: PacketEdit | null,
): DraftDocument[] {
  if (edit?.submission_id === submission_id) return edit.packet;
  return documents.map((d) => ({
    kind: d.kind,
    name: d.name,
    status: d.status,
    required: d.required,
  }));
}

/**
 * What the broker sees: their own file and what is being asked of them. No
 * cards, no risk score, no timeline. The agent's internal scoring is the
 * carrier's, not the broker's.
 */
function BrokerView({
  s,
  finding,
  documents,
  submitting,
  submitError,
  onResubmit,
}: {
  s: SubmissionRow;
  finding?: FindingRow;
  documents: DocumentRow[];
  submitting: boolean;
  submitError?: string;
  onResubmit: (draft: SubmissionDraft) => void;
}) {
  const [edit, setEdit] = useState<PacketEdit | null>(null);
  const packet = packetFor(s.submission_id, documents, edit);
  const outstanding = s.decision === "request-info" ? (finding?.missing_info ?? []) : [];

  return (
    <>
      <header className="screen__head">
        <div>
          <h2>{s.applicant_name}</h2>
          <p className="sub">{s.submission_id}</p>
        </div>
        <StatusPill s={s} />
      </header>

      <div className="detail">
        <section>
          <h3>As filed</h3>
          <Facts s={s} />
        </section>
        <section>
          <h3>From the underwriter</h3>
          {s.decision ? (
            <p>{s.decision_note ?? "No note was left."}</p>
          ) : (
            <p className="sub">No decision yet.</p>
          )}
          {outstanding.length > 0 ? (
            <>
              <h4>Still needed</h4>
              <ul className="missing-list">
                {outstanding.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
        <section>
          <h3>Resubmit</h3>
          <p className="sub">
            Update the packet and file it again. The submission keeps its id and
            its revision goes up by one.
          </p>
          <DocumentsEditor
            documents={packet}
            onChange={(next) => setEdit({ submission_id: s.submission_id, packet: next })}
          />
          {submitError ? <div className="banner error">{submitError}</div> : null}
          <div className="form__actions">
            <button
              className="btn"
              disabled={submitting}
              onClick={() =>
                onResubmit({
                  applicant_name: s.applicant_name,
                  business_type: s.business_type,
                  state: s.state ?? "",
                  property_value_usd: s.property_value_usd?.toString() ?? "",
                  annual_revenue_usd: s.annual_revenue_usd?.toString() ?? "",
                  documents: packet,
                })
              }
            >
              {submitting ? "Filing and reviewing…" : "Resubmit"}
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
