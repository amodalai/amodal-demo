import {
  useStoreQuery,
  useIntentRun,
  useAmodalContext,
  ChatWidget,
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

function RecPill({ rec }: { rec?: string | null }) {
  if (!rec) return <span className="pill muted">Not analyzed</span>;
  return <span className={`pill rec-${rec}`}>{REC_LABEL[rec] ?? rec}</span>;
}

function Row({
  s,
  finding,
  onAnalyzed,
}: {
  s: SubmissionRow;
  finding?: FindingRow;
  onAnalyzed: () => Promise<unknown>;
}) {
  const analyze = useIntentRun("analyze-submission-action");
  const isRunning = analyze.status === "running";

  async function onAnalyze() {
    try {
      await analyze.run({ submission_id: s.submission_id });
      await onAnalyzed();
    } catch {}
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
        {analyze.error ? (
          <div className="row-error">
            {analyze.error.message ?? "Analysis failed."}
          </div>
        ) : null}
        <button className="btn" disabled={isRunning} onClick={onAnalyze}>
          {isRunning ? "Analyzing…" : s.analyzed_at ? "Re-analyze" : "Analyze"}
        </button>
      </td>
    </tr>
  );
}

export default function App() {
  const { runtimeUrl } = useAmodalContext();
  const subsQ = useStoreQuery<SubmissionRow>("submissions", { limit: 200 });
  const findingsQ = useStoreQuery<FindingRow>("risk_findings", { limit: 200 });

  const submissions = (subsQ.data ?? [])
    .map((r) => r.value)
    .sort((a, b) => a.applicant_name.localeCompare(b.applicant_name));
  const findingBySub = new Map<string, FindingRow>();
  for (const r of findingsQ.data ?? [])
    findingBySub.set(r.value.submission_id, r.value);

  const refetch = () => Promise.all([subsQ.refetch(), findingsQ.refetch()]);

  return (
    <div className="page">
      <header className="head">
        <h1>Underwriting Review</h1>
        <p className="sub">
          Triage commercial-property submissions against the fictional
          underwriting guide. Click <em>Analyze</em> to score one: the agent recommends a
          workflow status for a human underwriter. It never binds coverage,
          prices premium, or gives legal advice.
        </p>
      </header>

      {submissions.length === 0 ? (
        <div className="empty">
          <p>No submissions in the store yet.</p>
          <p className="sub">
            Open the chat (bottom-right) and send <code>seed</code> once to load
            the four demo submissions. This screen refreshes automatically.
            (Seeding runs the classic <code>seed-examples</code> chat intent,
            which only a chat message can trigger.)
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
                onAnalyzed={refetch}
              />
            ))}
          </tbody>
        </table>
      )}

      <footer className="foot">
        Fictional demo. Submissions, findings, and the underwriting guide are
        made up. The agent assists; a human decides.
      </footer>

      <ChatWidget
        position="floating"
        serverUrl={runtimeUrl}
        user={{ id: "operator" }}
        getToken={async () => ""}
        sessionType="default"
        theme={{ primaryColor: "#000000", mode: "light" }}
        onStreamEnd={() => {
          void refetch();
        }}
      />
    </div>
  );
}
