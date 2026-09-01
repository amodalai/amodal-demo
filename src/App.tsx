import { useEffect, useMemo, useRef, useState } from "react";
import {
  useToolRun,
  useAutomation,
  useAmodalContext,
  ChatWidget,
  RuntimeClient,
} from "@amodalai/react";

/**
 * The demo's tenants: two underwriting desks, each a scope_id. Every request
 * the UI makes carries the selected desk's scope, so sessions, memory, and
 * store rows partition per desk. The ids are stable identifiers (what Amodal
 * sees); the labels are this app's own display names.
 */
const DESKS = [
  { id: "desk-pacific", label: "Pacific desk" },
  { id: "desk-atlantic", label: "Atlantic desk" },
] as const;

function initialDesk(): string {
  try {
    const d = localStorage.getItem("uw-desk");
    if (d && DESKS.some((x) => x.id === d)) return d;
  } catch {}
  return DESKS[0].id;
}

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

// The management surface returns more; the toggle needs only these fields.
interface AutoSyncBinding {
  id: string;
  enabled: boolean;
  tool?: string;
}

/**
 * The step-10 control: a platform-managed automation binding that runs
 * `sync_submissions` on a daily cadence with no UI open and no human present.
 * `schedule` creates the binding; the checkbox then flips `enabled`. The
 * management surface (list/enable/disable) is wired in the cloud runtime;
 * locally it 404s, so the control degrades to a note instead of breaking.
 */
function AutoSyncToggle({ desk }: { desk: string }) {
  const auto = useAutomation({ scopeId: desk });
  const [binding, setBinding] = useState<AutoSyncBinding | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const all = (await auto.list()) as AutoSyncBinding[];
    setBinding(all.find((a) => a.tool === "sync_submissions") ?? null);
  }

  useEffect(() => {
    refresh()
      .then(() => setState("ready"))
      .catch(() => setState("unavailable"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "loading") return null;
  if (state === "unavailable") {
    return <span className="autosync muted">Auto-sync: cloud only</span>;
  }

  const on = binding?.enabled === true;

  async function toggle() {
    setBusy(true);
    try {
      if (!binding) {
        await auto.schedule("sync_submissions", {
          schedule: { every: "1d" },
          label: "Daily inbox sync",
        });
      } else if (on) {
        await auto.disable(binding.id);
      } else {
        await auto.enable(binding.id);
      }
      await refresh();
    } catch {
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="autosync" title="Sync the broker inbox once a day, with no UI open.">
      <input
        type="checkbox"
        checked={on}
        disabled={busy}
        onChange={() => void toggle()}
      />
      Auto-sync daily
    </label>
  );
}

const REC_LABEL: Record<string, string> = {
  "ready-to-quote": "Ready to quote",
  "quote-with-conditions": "Quote w/ conditions",
  "request-info": "Request info",
  refer: "Refer",
  decline: "Decline",
};

// Client-side preview of what `send_outcome` will email, so the confirm modal
// shows the operator the real message before they approve it. Mirrors the
// tool's buildReply (amodal/tools/send_outcome/handler.ts) closely enough to
// confirm against; the tool stays the source of truth for what actually sends.
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

function previewSubject(s: SubmissionRow): string {
  const applicantName = s.applicant_name.replace(/[^\x00-\x7F]/g, "");
  return `Re: ${applicantName} - submission update`;
}

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
 * ignores that narration and does not wait for it.
 */
async function runAnalyzeCommand(
  client: RuntimeClient,
  submission_id: string,
  scopeId: string,
): Promise<void> {
  const analyzeCallIds = new Set<string>();
  for await (const ev of client.chatStream(`analyze ${submission_id}`, {
    agent: "default",
    scopeId,
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
          <dd>{previewSubject(s)}</dd>
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

interface Pipeline {
  submissions: SubmissionRow[];
  findings: FindingRow[];
}

const EMPTY_PIPELINE: Pipeline = { submissions: [], findings: [] };

export default function App() {
  const { runtimeUrl } = useAmodalContext();
  const [desk, setDesk] = useState(initialDesk);
  const scopeRef = useRef({ desk });
  const chatClient = useMemo(
    () => new RuntimeClient({ runtimeUrl, getToken: async () => "" }),
    [runtimeUrl],
  );
  // Every lane carries the desk's scope: the store rows these runs touch
  // live in that desk's partition, invisible to the other desk.
  const pipelineQ = useToolRun("list_pipeline", { scopeId: desk });
  const sync = useToolRun("sync_submissions", { scopeId: desk });
  const sendReply = useToolRun("send_outcome", { scopeId: desk });
  const [pipeline, setPipeline] = useState<Pipeline>(EMPTY_PIPELINE);
  const [replyTarget, setReplyTarget] = useState<{
    desk: string;
    s: SubmissionRow;
    finding: FindingRow;
  } | null>(null);
  const isSyncing = sync.status === "running";
  const isSending = sendReply.status === "running";

  const submissions = [...pipeline.submissions].sort((a, b) =>
    a.applicant_name.localeCompare(b.applicant_name),
  );
  const findingBySub = new Map<string, FindingRow>();
  for (const f of pipeline.findings) findingBySub.set(f.submission_id, f);

  // The direct store REST reads are scope-blind (agent-level partition), so
  // the table reads through the scoped list_pipeline invoke tool instead.
  // The invoke lane's response carries the tool's return value as `result`;
  // the SDK's ToolRunResult type doesn't declare it yet, hence the cast.
  async function refetch() {
    const scope = scopeRef.current;
    if (scope.desk !== desk) return;
    const res = await pipelineQ.run({});
    const data = (res as { result?: Pipeline }).result;
    if (data && scopeRef.current === scope) setPipeline(data);
  }

  useEffect(() => {
    refetch().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desk]);

  function onPickDesk(id: string) {
    if (id === desk) return;
    scopeRef.current = { desk: id };
    setPipeline(EMPTY_PIPELINE);
    setReplyTarget(null);
    pipelineQ.reset();
    sync.reset();
    sendReply.reset();
    setDesk(id);
    try {
      localStorage.setItem("uw-desk", id);
    } catch {}
  }

  async function onSync() {
    try {
      await sync.run({});
      await refetch();
    } catch {}
  }

  async function onConfirmSend() {
    if (!replyTarget || replyTarget.desk !== desk) return;
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
          <div className="head__actions">
            <select
              className="desk"
              value={desk}
              onChange={(e) => onPickDesk(e.target.value)}
              title="Each desk is a scope_id: its submissions, findings, sessions, and memory are partitioned from the other desk's."
            >
              {DESKS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
            <AutoSyncToggle key={desk} desk={desk} />
            <button className="btn" disabled={isSyncing} onClick={onSync}>
              {isSyncing ? "Syncing…" : "Sync inbox"}
            </button>
          </div>
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

      {submissions.length === 0 && pipelineQ.status === "running" ? (
        <div className="empty">
          <p>Loading the desk's pipeline…</p>
        </div>
      ) : submissions.length === 0 ? (
        <div className="empty">
          <p>No submissions on this desk yet.</p>
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
                analyze={(id) => runAnalyzeCommand(chatClient, id, desk)}
                onAnalyzed={refetch}
                onReply={(sub, finding) => {
                  sendReply.reset?.();
                  setReplyTarget({ desk, s: sub, finding });
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
        key={desk}
        position="floating"
        serverUrl={runtimeUrl}
        user={{ id: "operator" }}
        getToken={async () => ""}
        agent="default"
        scopeId={desk}
        theme={{ primaryColor: "#000000", mode: "light" }}
        onStreamEnd={() => {
          void refetch();
        }}
      />
    </div>
  );
}
