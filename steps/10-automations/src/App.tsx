import { useEffect, useRef, useState } from "react";
import { useStoreQuery, useToolRun, useAmodalContext, ChatWidget } from "@amodalai/react";
import type { Decision } from "../amodal/_lib/decision";
import { useSubmissionActions } from "./actions";
import { BROKER, usePersona } from "./persona";
import { hashOf, resolveRoute, type Role, type Route } from "./routes";
import { errorMessage, runTool } from "./tools";
import {
  byId,
  forSubmission,
  type DocumentRow,
  type EventRow,
  type FindingRow,
  type SubmissionRow,
} from "./types";
import { AutoSyncToggle } from "./components/AutoSyncToggle";
import { DecideModal } from "./components/DecideModal";
import { ReplyModal } from "./components/ReplyModal";
import { Modal } from "./components/Modal";
import { Sidebar } from "./components/Sidebar";
import { Guide } from "./screens/Guide";
import { History } from "./screens/History";
import { MySubmissions } from "./screens/MySubmissions";
import { NewSubmission, type SubmissionDraft } from "./screens/NewSubmission";
import { Pipeline as PipelineScreen } from "./screens/Pipeline";
import { SubmissionDetail } from "./screens/SubmissionDetail";

const numberOr = (s: string) => {
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return s.trim() && Number.isFinite(n) ? n : null;
};

export default function App() {
  const { runtimeUrl, client: chatClient } = useAmodalContext();
  const [role, setRole] = usePersona();
  const [hash, setHash] = useState(() => window.location.hash);

  const subsQ = useStoreQuery<SubmissionRow>("submissions", { limit: 200 });
  const findingsQ = useStoreQuery<FindingRow>("risk_findings", { limit: 200 });
  const docsQ = useStoreQuery<DocumentRow>("documents", { limit: 500 });
  const eventsQ = useStoreQuery<EventRow>("events", { limit: 500 });
  const seed = useToolRun("seed_examples");
  const reset = useToolRun("reset_demo");
  const sync = useToolRun("sync_submissions");
  const sendReply = useToolRun("send_outcome");
  const decide = useToolRun("decide_submission");
  const submit = useToolRun("submit_submission");

  const seededRef = useRef(false);
  const triagedRef = useRef(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetError, setResetError] = useState<string | undefined>();
  const [syncError, setSyncError] = useState<string | undefined>();
  const [sendError, setSendError] = useState<string | undefined>();
  const [replyTarget, setReplyTarget] = useState<{ s: SubmissionRow; finding: FindingRow } | null>(
    null,
  );

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

  const all = (subsQ.data ?? [])
    .map((r) => r.value)
    .sort((a, b) => a.applicant_name.localeCompare(b.applicant_name));
  const mine = all.filter((s) => s.requested_by === BROKER.email);
  const findingBySub = byId((findingsQ.data ?? []).map((r) => r.value));
  const documents = (docsQ.data ?? []).map((r) => r.value);
  const events = (eventsQ.data ?? []).map((r) => r.value);

  const refetch = () =>
    Promise.all([subsQ.refetch(), findingsQ.refetch(), docsQ.refetch(), eventsQ.refetch()]);

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
  const empty = !subsQ.isLoading && !subsQ.error && all.length === 0;
  useEffect(() => {
    if (!empty || seededRef.current) return;
    seededRef.current = true;
    void runSeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empty]);

  const actions = useSubmissionActions({
    client: chatClient,
    submitDecision: (input) => runTool(decide, input),
    refetch,
  });

  // The demo triages itself on first open: once the pipeline has settled, every
  // un-analyzed submission goes into the same serial queue the Analyze all
  // button fills. Guarded per page load so a refetch does not re-fire it.
  useEffect(() => {
    if (subsQ.isLoading || seed.status === "running") return;
    if (all.length === 0 || triagedRef.current) return;
    triagedRef.current = true;
    for (const s of all) if (!s.analyzed_at) actions.analyze(s.submission_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all.length, subsQ.isLoading, seed.status]);

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
    setSyncError(undefined);
    try {
      await runTool(sync, {});
      await refetch();
    } catch (err) {
      setSyncError(errorMessage(err, "Sync failed."));
    }
  }

  async function onConfirmSend() {
    if (!replyTarget) return;
    setSendError(undefined);
    try {
      await runTool(sendReply, { submission_id: replyTarget.s.submission_id });
      await refetch();
      setReplyTarget(null);
    } catch (err) {
      setSendError(errorMessage(err, "Sending the reply failed."));
    }
  }

  async function onReset() {
    setResetError(undefined);
    try {
      await runTool(reset, {});
      triagedRef.current = false;
      await refetch();
      setConfirmReset(false);
    } catch (err) {
      setResetError(errorMessage(err, "The reset failed."));
    }
  }

  const loading =
    seed.status === "running"
      ? "Loading the demo…"
      : subsQ.isLoading
        ? "Loading the pipeline…"
        : null;
  const openReply = (s: SubmissionRow, finding: FindingRow) => {
    sendReply.reset();
    setSendError(undefined);
    setReplyTarget({ s, finding });
  };
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
        <AutoSyncToggle />
        <button className="btn" disabled={sync.status === "running"} onClick={() => void onSync()}>
          {sync.status === "running" ? "Syncing…" : "Sync inbox"}
        </button>
      </Sidebar>

      <main className="main">
        {syncError ? <div className="banner error">{syncError}</div> : null}
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
            events={events}
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
            documents={forSubmission(documents, route.submission_id)}
            events={forSubmission(events, route.submission_id)}
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
          error={sendError}
          onConfirm={() => void onConfirmSend()}
          onCancel={() => setReplyTarget(null)}
        />
      ) : null}

      {confirmReset ? (
        <Modal
          title="Reset demo data"
          sub="This deletes every submission, document, claim, finding, and event and reloads the demo. Continue?"
          busy={reset.status === "running"}
          error={resetError}
          confirmLabel="Reset"
          busyLabel="Resetting…"
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
