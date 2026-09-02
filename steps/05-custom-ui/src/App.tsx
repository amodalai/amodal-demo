import { useEffect, useRef, useState } from "react";
import {
  useStoreQuery,
  useToolRun,
  useAmodalContext,
  ChatWidget,
  RuntimeClient,
  type ResolvedToolRun,
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
}

interface FindingRow {
  finding_id: string;
  submission_id: string;
  recommendation: string;
  risk_score: number;
  summary: string;
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

/**
 * Run an invoke-lane tool and return its result. The SDK resolves a thrown
 * handler error as an outcome with the message in `reason` (prefixed by the
 * runtime with the tool's name), so this turns every non-complete outcome back
 * into a rejection carrying the handler's own message.
 */
async function runTool<I, R = unknown>(
  launcher: { run(input: I): Promise<ResolvedToolRun> },
  input: I,
): Promise<R | undefined> {
  const res = (await launcher.run(input)) as ResolvedToolRun & { result?: R };
  if (res.outcome.kind !== "complete") {
    throw new Error(
      (res.outcome.reason ?? "The tool run failed.").replace(
        /^Tool "[^"]+" failed: /,
        "",
      ),
    );
  }
  return res.result;
}

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

function RecPill({ rec }: { rec?: string | null }) {
  if (!rec) return <span className="pill muted">Not analyzed</span>;
  return <span className={`pill rec-${rec}`}>{REC_LABEL[rec] ?? rec}</span>;
}

function Row({
  s,
  finding,
  analyze,
  onAnalyzed,
}: {
  s: SubmissionRow;
  finding?: FindingRow;
  analyze: (submission_id: string) => Promise<void>;
  onAnalyzed: () => Promise<unknown>;
}) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

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
      </td>
      <td>{s.business_type}</td>
      <td>{s.state ?? "—"}</td>
      <td>
        <RecPill rec={s.recommendation} />
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
        <div className="act__stack">
          <button className="btn" disabled={isAnalyzing} onClick={onAnalyze}>
            {isAnalyzing
              ? "Analyzing…"
              : s.analyzed_at
                ? "Re-analyze"
                : "Analyze"}
          </button>
        </div>
        {analyzeError ? <div className="row-error">{analyzeError}</div> : null}
      </td>
    </tr>
  );
}

function ResetModal({
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">Reset demo data</h2>
        <p className="sub">
          This deletes every submission, document, claim, and finding and
          reloads the demo. Continue?
        </p>
        {error ? <div className="banner error">{error}</div> : null}
        <div className="modal__actions">
          <button className="btn btn--ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button className="btn" disabled={busy} onClick={onConfirm}>
            {busy ? "Resetting…" : "Reset"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { runtimeUrl, client: chatClient } = useAmodalContext();
  const subsQ = useStoreQuery<SubmissionRow>("submissions", { limit: 200 });
  const findingsQ = useStoreQuery<FindingRow>("risk_findings", { limit: 200 });
  const seed = useToolRun("seed_examples");
  const reset = useToolRun("reset_demo");
  const seededRef = useRef(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetError, setResetError] = useState<string | undefined>();
  const isResetting = reset.status === "running";

  const submissions = (subsQ.data ?? [])
    .map((r) => r.value)
    .sort((a, b) => a.applicant_name.localeCompare(b.applicant_name));
  const findingBySub = new Map<string, FindingRow>();
  for (const r of findingsQ.data ?? [])
    findingBySub.set(r.value.submission_id, r.value);

  const refetch = () => Promise.all([subsQ.refetch(), findingsQ.refetch()]);

  async function runSeed() {
    setSeedError(null);
    try {
      await runTool(seed, {});
      await refetch();
    } catch (err) {
      setSeedError(errorMessage(err, "Loading the demo failed."));
    }
  }

  // The runtime has no startup hook, so an empty store loads the demo
  // dataset on first mount, once per page load.
  const empty = !subsQ.isLoading && !subsQ.error && submissions.length === 0;
  useEffect(() => {
    if (!empty || seededRef.current) return;
    seededRef.current = true;
    void runSeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empty]);

  async function onReset() {
    setResetError(undefined);
    try {
      await runTool(reset, {});
      await refetch();
      setConfirmReset(false);
    } catch (err) {
      setResetError(errorMessage(err, "The reset failed."));
    }
  }

  return (
    <div className="page">
      <header className="head">
        <div className="head__bar">
          <div className="brand">
            <span className="brand__mark" aria-hidden="true">
              UR
            </span>
            <h1>Underwriting Review</h1>
          </div>
          <button
            className="btn btn--ghost"
            onClick={() => setConfirmReset(true)}
          >
            Reset demo data
          </button>
        </div>
        <p className="sub">
          Triage commercial-property submissions against the fictional
          underwriting guide. The demo dataset loads itself on first open;{" "}
          <em>Reset demo data</em> puts it back. Click <em>Analyze</em> to
          score one: the agent recommends a
          workflow status for a human underwriter. It never binds coverage,
          prices premium, or gives legal advice.
        </p>
        {seedError ? (
          <div className="banner error">
            {seedError}{" "}
            <button className="btn btn--ghost" onClick={() => void runSeed()}>
              Retry
            </button>
          </div>
        ) : null}
      </header>

      {submissions.length === 0 && seed.status === "running" ? (
        <div className="empty">
          <p>Loading the demo…</p>
        </div>
      ) : submissions.length === 0 && subsQ.isLoading ? (
        <div className="empty">
          <p>Loading…</p>
        </div>
      ) : submissions.length === 0 ? (
        <div className="empty">
          <p>No submissions in the store yet.</p>
          <p className="sub">
            The four demo submissions load themselves on first open. Click{" "}
            <strong>Reset demo data</strong> to load it again. This screen
            refreshes automatically.
          </p>
        </div>
      ) : (
        <div className="grid-wrap">
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
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="foot">
        Fictional demo. Submissions, findings, and the underwriting guide are
        made up. The agent assists; a human decides.
      </footer>

      {confirmReset ? (
        <ResetModal
          busy={isResetting}
          error={resetError}
          onConfirm={() => void onReset()}
          onCancel={() => setConfirmReset(false)}
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
