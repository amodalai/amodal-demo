import { useMemo, useState } from "react";
import {
  useStoreQuery,
  useIntentRun,
  useAmodalContext,
  ChatWidget,
  RuntimeClient,
} from "@amodalai/react";

interface SubmissionRow {
  submission_id: string;
  applicant_name: string;
  business_type: string;
  state?: string | null;
  status?: string;
  recommendation?: string | null;
  risk_score?: number | null;
  analyzed_at?: string | null;
  broker_email?: string | null;
  reply_status?: string | null;
}

interface FindingRow {
  finding_id: string;
  submission_id: string;
  recommendation: string;
  risk_score: number;
  summary: string;
  cards?: Array<{ category: string; status: string; note: string }>;
  missing_info: string[];
  conditions: string[];
}

const REC_LABEL: Record<string, string> = {
  "ready-to-quote": "Ready to quote",
  "quote-with-conditions": "Quote w/ conditions",
  "request-info": "Request info",
  refer: "Refer",
  decline: "Decline",
};

// Client-side preview of what `send-outcome` will email, so the confirm modal
// shows the operator the real message before they approve it. Mirrors the
// intent's buildReply (amodal/intents/send-outcome/intent.ts) closely enough to
// confirm against; the intent stays the source of truth for what actually sends.
const REPLY_OPENING: Record<string, string> = {
  "ready-to-quote":
    "Good news: this submission meets our underwriting guidelines and we are ready to prepare a quote.",
  "quote-with-conditions":
    "We can move ahead with a quote, subject to the conditions below.",
  "request-info":
    "Before we can proceed, we need some additional information (listed below).",
  refer:
    "This submission needs a senior-underwriter review; we have referred it internally and will follow up.",
  decline:
    "After review, we are unable to offer terms on this submission at this time.",
};

function previewReply(s: SubmissionRow, finding: FindingRow): string {
  const lines: string[] = ["Hello,", "", `Re: ${s.applicant_name}`, ""];
  lines.push(
    REPLY_OPENING[finding.recommendation] ??
      `Update on this submission: ${finding.recommendation}.`,
  );
  if (finding.missing_info?.length) {
    lines.push("", "Still needed:");
    for (const m of finding.missing_info) lines.push(`  - ${m}`);
  }
  if (finding.conditions?.length) {
    lines.push("", "Conditions:");
    for (const c of finding.conditions) lines.push(`  - ${c}`);
  }
  lines.push(
    "",
    "This is a workflow update only. It does not bind coverage or confirm pricing.",
  );
  lines.push("Reply with any questions.", "", "— Underwriting");
  return lines.join("\n");
}

/**
 * Run the `analyze <id>` chat command for one submission. The command
 * matches the regex trigger on the `analyze_submission` composite tool, so
 * the triage itself runs deterministically from the request path and is
 * already saved to the stores by the time its `tool_call_result` event
 * arrives. This function stops listening right there and returns, so the
 * caller can refetch the stores immediately. The model then narrates the
 * saved finding into the (separate) chat session this call creates; the UI
 * ignores that narration and does not wait for it. This replaces the old
 * `analyze-submission-action` replay intent: the runtime's intent run path
 * cannot reach subagents, so the button now enters through the same door
 * as the chat command.
 */
async function runAnalyzeCommand(
  client: RuntimeClient,
  submission_id: string,
): Promise<void> {
  const analyzeCallIds = new Set<string>();
  for await (const ev of client.chatStream(`analyze ${submission_id}`, {
    agent: "default",
  })) {
    if (ev.type === "tool_call_start" && ev.tool_name === "analyze_submission") {
      analyzeCallIds.add(ev.tool_id);
    }
    if (ev.type === "tool_call_result" && analyzeCallIds.has(ev.tool_id)) {
      if (ev.status === "error") {
        throw new Error(
          typeof ev.error === "string" ? ev.error : "Analysis failed.",
        );
      }
      if (typeof ev.result === "string") {
        let outcome: { found?: boolean } | undefined;
        try {
          outcome = JSON.parse(ev.result) as { found?: boolean };
        } catch {
          // Unparseable result: leave it to the store refetch to show state.
        }
        if (outcome?.found === false) {
          throw new Error(
            `Submission ${submission_id} not found, and it is not one of the demo submissions.`,
          );
        }
      }
      // Triage succeeded and is persisted; the rest of the stream is
      // narration into a session the UI discards, so stop here rather
      // than waiting on (and risking an error from) that separate turn.
      return;
    }
    if (ev.type === "error") {
      throw new Error(ev.message || "Analysis failed.");
    }
  }
}

function RecPill({ rec }: { rec?: string | null }) {
  if (!rec) return <span className="pill muted">Not analyzed</span>;
  return <span className={`pill rec-${rec}`}>{REC_LABEL[rec] ?? rec}</span>;
}

function Row({
  s,
  finding,
  analyze,
  onAnalyzed,
  onReply,
}: {
  s: SubmissionRow;
  finding?: FindingRow;
  analyze: (submission_id: string) => Promise<void>;
  onAnalyzed: () => Promise<unknown>;
  onReply: (s: SubmissionRow, finding: FindingRow) => void;
}) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const replied = s.reply_status === "sent";
  const claimsNote = finding?.cards
    ?.find((c) => c.category === "claims")
    ?.note?.trim();

  async function onAnalyze() {
    setIsAnalyzing(true);
    setAnalyzeError(null);
    try {
      await analyze(s.submission_id);
      await onAnalyzed();
    } catch (err) {
      setAnalyzeError(
        err instanceof Error ? err.message : "Analysis failed.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <tr>
      <td>
        <div className="name">{s.applicant_name}</div>
        <div className="id" title={s.submission_id}>
          {s.submission_id}
        </div>
        {s.broker_email ? (
          <div className="id" title={s.broker_email}>
            {s.broker_email}
          </div>
        ) : null}
      </td>
      <td>{s.business_type}</td>
      <td>{s.state ?? "—"}</td>
      <td>
        <RecPill rec={s.recommendation} />
        {claimsNote ? <div className="claims-note">{claimsNote}</div> : null}
      </td>
      <td className="num">{s.risk_score ?? "—"}</td>
      <td className="missing">
        {finding?.missing_info?.length ? (
          <ul className="missing-list">
            {finding.missing_info.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : (
          "—"
        )}
      </td>
      <td className="act">
        {analyzeError ? (
          <div className="row-error">{analyzeError}</div>
        ) : null}
        <button className="btn" disabled={isAnalyzing} onClick={onAnalyze}>
          {isAnalyzing
            ? "Analyzing…"
            : s.analyzed_at
              ? "Re-analyze"
              : "Analyze"}
        </button>
        {finding ? (
          <div className="reply-state">
            {replied ? (
              <span className="pill sent">Replied</span>
            ) : (
              <button
                className="btn btn--ghost"
                onClick={() => onReply(s, finding)}
              >
                Send reply
              </button>
            )}
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function ReplyModal({
  target,
  sending,
  error,
  onConfirm,
  onCancel,
}: {
  target: { s: SubmissionRow; finding: FindingRow };
  sending: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { s, finding } = target;
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">Send reply to the broker</h2>
        <p className="sub">
          This emails the triage outcome out via the Gmail connection: a real,
          irreversible send. Review it, then confirm.
        </p>
        <dl className="modal__fields">
          <dt>To</dt>
          <dd>{s.broker_email ?? "—"}</dd>
          <dt>Subject</dt>
          <dd>{`Re: ${s.applicant_name} - submission update`}</dd>
        </dl>
        <pre className="modal__body">{previewReply(s, finding)}</pre>
        {error ? <div className="banner error">{error}</div> : null}
        <div className="modal__actions">
          <button
            className="btn btn--ghost"
            disabled={sending}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="btn"
            disabled={sending || !s.broker_email}
            onClick={onConfirm}
          >
            {sending ? "Sending…" : "Confirm & send"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { runtimeUrl } = useAmodalContext();
  const chatClient = useMemo(
    () => new RuntimeClient({ runtimeUrl, getToken: async () => "" }),
    [runtimeUrl],
  );
  const subsQ = useStoreQuery<SubmissionRow>("submissions", { limit: 200 });
  const findingsQ = useStoreQuery<FindingRow>("risk_findings", { limit: 200 });
  const sync = useIntentRun("sync-submissions");
  const sendReply = useIntentRun("send-outcome");
  const [replyTarget, setReplyTarget] = useState<{
    s: SubmissionRow;
    finding: FindingRow;
  } | null>(null);
  const isSyncing = sync.status === "running";
  const isSending = sendReply.status === "running";

  const submissions = (subsQ.data ?? [])
    .map((r) => r.value)
    .sort((a, b) => a.applicant_name.localeCompare(b.applicant_name));
  const findingBySub = new Map<string, FindingRow>();
  for (const r of findingsQ.data ?? [])
    findingBySub.set(r.value.submission_id, r.value);

  const refetch = () => Promise.all([subsQ.refetch(), findingsQ.refetch()]);

  async function onSync() {
    try {
      await sync.run({});
      await refetch();
    } catch {}
  }

  async function onConfirmSend() {
    if (!replyTarget) return;
    try {
      await sendReply.run({ submission_id: replyTarget.s.submission_id });
      await refetch();
      setReplyTarget(null);
    } catch {}
  }

  return (
    <div className="page">
      <header className="head">
        <div className="head__bar">
          <h1>Underwriting Review</h1>
          <button className="btn" disabled={isSyncing} onClick={onSync}>
            {isSyncing ? "Syncing…" : "Sync inbox"}
          </button>
        </div>
        <p className="sub">
          Triage commercial-property submissions against the fictional
          underwriting guide. <em>Sync inbox</em> pulls submissions from the broker mailbox
          (read-only); <em>Analyze</em> scores one; <em>Send reply</em> emails
          the outcome back to the broker (a confirmed send). The agent
          recommends a workflow status for a human underwriter. It never binds
          coverage, prices premium, or gives legal advice.
        </p>
        {sync.error ? (
          <div className="banner error">
            {sync.error.message ?? "Sync failed."}
          </div>
        ) : null}
      </header>

      {submissions.length === 0 ? (
        <div className="empty">
          <p>No submissions in the store yet.</p>
          <p className="sub">
            Click <strong>Sync inbox</strong> to pull submissions from the
            broker mailbox. With no mailbox connected, it loads the five demo
            submissions instead. This screen refreshes automatically. (You can
            also send <code>seed</code> in the chat.)
          </p>
        </div>
      ) : (
        <table className="grid">
          <thead>
            <tr>
              <th>Applicant</th>
              <th>Business</th>
              <th>State</th>
              <th>Recommendation</th>
              <th className="num">Risk</th>
              <th>Missing info</th>
              <th className="act"></th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <Row
                key={s.submission_id}
                s={s}
                finding={findingBySub.get(s.submission_id)}
                analyze={(id) => runAnalyzeCommand(chatClient, id)}
                onAnalyzed={refetch}
                onReply={(sub, finding) => {
                  sendReply.reset?.();
                  setReplyTarget({ s: sub, finding });
                }}
              />
            ))}
          </tbody>
        </table>
      )}

      <footer className="foot">
        Fictional demo. Submissions, findings, and the underwriting guide are
        made up. The agent assists; a human decides.
      </footer>

      {replyTarget ? (
        <ReplyModal
          target={replyTarget}
          sending={isSending}
          error={sendReply.error?.message}
          onConfirm={onConfirmSend}
          onCancel={() => setReplyTarget(null)}
        />
      ) : null}

      <ChatWidget
        position="floating"
        serverUrl={runtimeUrl}
        user={{ id: "operator" }}
        getToken={async () => ""}
        agent="default"
        theme={{ primaryColor: "#000000", mode: "light" }}
        onStreamEnd={() => {
          void refetch();
        }}
      />
    </div>
  );
}
