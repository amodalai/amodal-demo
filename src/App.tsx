import { useEffect, useRef, useState } from "react";
import { useToolRun, useAmodalContext, ChatWidget } from "@amodalai/react";
import type { Decision } from "../amodal/_lib/decision";
import { useSubmissionActions } from "./actions";
import { BROKER, usePersona } from "./persona";
import { hashOf, resolveRoute, type Role, type Route } from "./routes";
import { errorMessage, runTool } from "./tools";
import {
  EMPTY_PIPELINE,
  byId,
  forSubmission,
  type FindingRow,
  type Pipeline,
  type SubmissionRow,
} from "./types";
import { AutoSyncToggle } from "./components/AutoSyncToggle";
import { DecideModal } from "./components/DecideModal";
import { Modal } from "./components/Modal";
import { ReplyModal } from "./components/ReplyModal";
import { Sidebar } from "./components/Sidebar";
import { Guide } from "./screens/Guide";
import { History } from "./screens/History";
import { MySubmissions } from "./screens/MySubmissions";
import { NewSubmission, type SubmissionDraft } from "./screens/NewSubmission";
import { Pipeline as PipelineScreen } from "./screens/Pipeline";
import { SubmissionDetail } from "./screens/SubmissionDetail";

/**
 * The demo's tenants: two underwriting desks, each a scope_id. Every request
 * the UI makes carries the selected desk's scope, so sessions, memory, and
 * store rows partition per desk. The ids are stable identifiers (what Amodal
 * sees); the labels are this app's own display names.
 *
 * Desks and personas are orthogonal: the desk decides which rows exist, the
 * persona decides how they are shown.
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

const numberOr = (s: string) => {
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return s.trim() && Number.isFinite(n) ? n : null;
};

export default function App() {
  const { runtimeUrl, client: chatClient } = useAmodalContext();
  const [role, setRole] = usePersona();
  const [hash, setHash] = useState(() => window.location.hash);
  const [desk, setDesk] = useState(initialDesk);
  const scopeRef = useRef({ desk });

  // Every lane carries the desk's scope: the store rows these runs touch
  // live in that desk's partition, invisible to the other desk.
  const pipelineQ = useToolRun("list_pipeline", { scopeId: desk });
  const sync = useToolRun("sync_submissions", { scopeId: desk });
  const sendReply = useToolRun("send_outcome", { scopeId: desk });
  const seed = useToolRun("seed_examples", { scopeId: desk });
  const reset = useToolRun("reset_demo", { scopeId: desk });
  const decide = useToolRun("decide_submission", { scopeId: desk });
  const submit = useToolRun("submit_submission", { scopeId: desk });

  const seededDesks = useRef(new Set<string>());
  const triagedDesks = useRef(new Set<string>());
  const [pipeline, setPipeline] = useState<Pipeline>(EMPTY_PIPELINE);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetError, setResetError] = useState<string | undefined>();
  const [replyTarget, setReplyTarget] = useState<{
    desk: string;
    s: SubmissionRow;
    finding: FindingRow;
  } | null>(null);

  const { route, redirect } = resolveRoute(role, hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (redirect && window.location.hash !== redirect) window.location.hash = redirect;
  }, [redirect]);

  const go = (next: Route) => {
    window.location.hash = hashOf(next);
  };

  // The direct store REST reads are scope-blind (agent-level partition), so
  // the table reads through the scoped list_pipeline invoke tool instead.
  // A desk found empty loads the demo dataset, once per desk per page load.
  async function refetch() {
    const scope = scopeRef.current;
    if (scope.desk !== desk) return;
    const data = await runTool<Record<string, never>, Pipeline>(pipelineQ, {});
    if (!data || scopeRef.current !== scope) return;
    setPipeline({ ...EMPTY_PIPELINE, ...data });
    if (data.submissions.length === 0 && !seededDesks.current.has(desk)) {
      seededDesks.current.add(desk);
      await runSeed();
    }
  }

  async function runSeed() {
    setSeedError(null);
    try {
      await runTool(seed, {});
      await refetch();
    } catch (err) {
      setSeedError(errorMessage(err, "Loading the demo failed."));
    }
  }

  useEffect(() => {
    refetch().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desk]);

  const actions = useSubmissionActions({
    client: chatClient,
    scopeId: desk,
    submitDecision: (input) => runTool(decide, input),
    refetch,
  });

  // The demo triages itself on first open: once a desk's pipeline has settled,
  // every un-analyzed submission goes into the same serial queue the Analyze
  // all button fills. Guarded per desk per page load so a refetch does not
  // re-fire it.
  useEffect(() => {
    if (pipelineQ.status === "running" || seed.status === "running") return;
    if (pipeline.submissions.length === 0 || triagedDesks.current.has(desk)) return;
    triagedDesks.current.add(desk);
    for (const s of pipeline.submissions) {
      if (!s.analyzed_at) actions.analyze(s.submission_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desk, pipeline.submissions, pipelineQ.status, seed.status]);

  function onPickDesk(id: string) {
    if (id === desk) return;
    scopeRef.current = { desk: id };
    setPipeline(EMPTY_PIPELINE);
    setReplyTarget(null);
    for (const lane of [pipelineQ, sync, sendReply, seed, reset, decide, submit]) lane.reset();
    setSeedError(null);
    setDesk(id);
    try {
      localStorage.setItem("uw-desk", id);
    } catch {}
  }

  function onPickRole(next: Role) {
    setRole(next);
    setSubmitError(undefined);
    go({ name: next === "broker" ? "new" : "pipeline" });
  }

  async function onSubmit(draft: SubmissionDraft, submission_id?: string) {
    setSubmitError(undefined);
    try {
      const out = await runTool<Record<string, unknown>, { submission_id: string }>(submit, {
        submission_id,
        applicant_name: draft.applicant_name.trim(),
        business_type: draft.business_type.trim(),
        state: draft.state.trim() || undefined,
        property_value_usd: numberOr(draft.property_value_usd) ?? undefined,
        annual_revenue_usd: numberOr(draft.annual_revenue_usd) ?? undefined,
        broker_email: BROKER.email,
        requested_by: BROKER.email,
        documents: draft.documents.filter((d) => d.name.trim()),
      });
      await refetch();
      if (out?.submission_id) go({ name: "submission", submission_id: out.submission_id });
    } catch (err) {
      setSubmitError(errorMessage(err, "Filing the submission failed."));
    }
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

  // The reset seeds the desk itself, so refetch must not seed it again.
  async function onReset() {
    setResetError(undefined);
    try {
      await runTool(reset, {});
      seededDesks.current.add(desk);
      triagedDesks.current.delete(desk);
      await refetch();
      setConfirmReset(false);
    } catch (err) {
      setResetError(errorMessage(err, "The reset failed."));
    }
  }

  const all = [...pipeline.submissions].sort((a, b) =>
    a.applicant_name.localeCompare(b.applicant_name),
  );
  const mine = all.filter((s) => s.requested_by === BROKER.email);
  const findingBySub = byId(pipeline.findings);
  const openReply = (s: SubmissionRow, finding: FindingRow) => {
    sendReply.reset();
    setReplyTarget({ desk, s, finding });
  };
  const loading =
    seed.status === "running"
      ? "Loading the demo…"
      : pipelineQ.status === "running"
        ? "Loading the desk's pipeline…"
        : null;
  const deciding = actions.deciding
    ? all.find((s) => s.submission_id === actions.deciding)
    : undefined;

  return (
    <div className="shell">
      <Sidebar
        role={role}
        route={route}
        onPickRole={onPickRole}
        badges={{ pipeline: all.length, mine: mine.length }}
        onReset={() => {
          setReplyTarget(null);
          setConfirmReset(true);
        }}
      >
        <label className="field">
          <span>Desk</span>
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
        </label>
        <AutoSyncToggle key={desk} desk={desk} />
        <button className="btn" disabled={sync.status === "running"} onClick={() => void onSync()}>
          {sync.status === "running" ? "Syncing…" : "Sync inbox"}
        </button>
      </Sidebar>

      <main className="main">
        {sync.error ? (
          <div className="banner error">{sync.error.message ?? "Sync failed."}</div>
        ) : null}
        {seedError ? (
          <div className="banner error">
            {seedError}{" "}
            <button className="btn btn--ghost" onClick={() => void runSeed()}>
              Retry
            </button>
          </div>
        ) : null}

        {route.name === "pipeline" ? (
          <PipelineScreen
            submissions={all}
            findingBySub={findingBySub}
            actions={actions}
            onOpen={(submission_id) => go({ name: "submission", submission_id })}
            onReply={openReply}
            loading={loading}
          />
        ) : route.name === "history" ? (
          <History
            events={pipeline.events}
            submissions={all}
            onOpen={(submission_id) => go({ name: "submission", submission_id })}
          />
        ) : route.name === "guide" ? (
          <Guide />
        ) : route.name === "new" ? (
          <NewSubmission
            busy={submit.status === "running"}
            error={submitError}
            onSubmit={(draft) => void onSubmit(draft)}
          />
        ) : route.name === "mine" ? (
          <MySubmissions
            submissions={mine}
            onOpen={(submission_id) => go({ name: "submission", submission_id })}
          />
        ) : route.name === "submission" ? (
          <SubmissionDetail
            role={role}
            s={all.find((s) => s.submission_id === route.submission_id)}
            finding={findingBySub.get(route.submission_id)}
            documents={forSubmission(pipeline.documents, route.submission_id)}
            events={forSubmission(pipeline.events, route.submission_id)}
            actions={actions}
            submitting={submit.status === "running"}
            submitError={submitError}
            onResubmit={(draft) => void onSubmit(draft, route.submission_id)}
            onReply={openReply}
          />
        ) : null}
      </main>

      {deciding ? (
        <DecideModal
          s={deciding}
          finding={findingBySub.get(deciding.submission_id)}
          busy={decide.status === "running"}
          error={actions.errors.get(deciding.submission_id)}
          onConfirm={(decision: Decision, note) =>
            void actions.decide(deciding.submission_id, decision, note).catch(() => {})
          }
          onCancel={actions.closeDecide}
        />
      ) : null}

      {replyTarget ? (
        <ReplyModal
          s={replyTarget.s}
          finding={replyTarget.finding}
          sending={sendReply.status === "running"}
          error={sendReply.error?.message}
          onConfirm={() => void onConfirmSend()}
          onCancel={() => setReplyTarget(null)}
        />
      ) : null}

      {confirmReset ? (
        <Modal
          title="Reset demo data"
          sub="This deletes every submission, document, claim, finding, and event on this desk and reloads the demo. Continue?"
          busy={reset.status === "running"}
          error={resetError}
          confirmLabel="Reset"
          busyLabel="Resetting…"
          onConfirm={() => void onReset()}
          onCancel={() => setConfirmReset(false)}
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
