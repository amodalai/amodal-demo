import { useMemo, useRef, useState } from "react";
import type { RuntimeClient } from "@amodalai/react";
import type { Decision } from "../amodal/_lib/decision";
import { runAnalyzeCommand } from "./analyze";
import { serial } from "./serial";
import { errorMessage } from "./tools";

export interface SubmissionActionsApi {
  /** Submissions with an analysis in flight or waiting in the queue. */
  analyzing: ReadonlySet<string>;
  activeAnalysis?: string;
  errors: ReadonlyMap<string, string>;
  /** The submission whose decide modal is open. */
  deciding?: string;
  analyze(submission_id: string): void;
  openDecide(submission_id: string): void;
  closeDecide(): void;
  decide(submission_id: string, decision: Decision, note: string): Promise<void>;
}

/**
 * The two things an underwriter does to a submission, held once so the pipeline
 * table and the detail screen behave identically.
 *
 * Analyses go through a serial queue: each one runs the reviewer subagent, and
 * a desk-wide Analyze all would otherwise open one model call per row.
 */
export function useSubmissionActions(opts: {
  client: RuntimeClient;
  scopeId?: string;
  submitDecision(input: { submission_id: string; decision: Decision; note: string }): Promise<unknown>;
  refetch: () => Promise<unknown>;
}): SubmissionActionsApi {
  const { client, scopeId, refetch } = opts;
  const [analyzing, setAnalyzing] = useState<ReadonlySet<string>>(new Set());
  const [activeAnalysis, setActiveAnalysis] = useState<string | undefined>();
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [deciding, setDeciding] = useState<{ id: string } | undefined>();
  const queue = useMemo(serial, []);
  const pending = useRef(new Set<string>());
  const prefix = `${JSON.stringify(scopeId ?? null)}:`;
  const localId = (id?: string) => id?.startsWith(prefix) ? id.slice(prefix.length) : undefined;

  const setError = (id: string, message?: string) =>
    setErrors((prev) => {
      const next = new Map(prev);
      if (message) next.set(id, message);
      else next.delete(id);
      return next;
    });

  const mark = (id: string, on: boolean) =>
    setAnalyzing((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  function analyze(submission_id: string) {
    const id = prefix + submission_id;
    if (pending.current.has(id)) return;
    pending.current.add(id);
    mark(id, true);
    setError(id);
    void queue(async () => {
      setActiveAnalysis(id);
      try {
        await runAnalyzeCommand(client, submission_id, scopeId);
        await refetch();
      } catch (err) {
        setError(id, errorMessage(err, "Analysis failed."));
      } finally {
        setActiveAnalysis(undefined);
        pending.current.delete(id);
        mark(id, false);
      }
    });
  }

  async function decide(submission_id: string, decision: Decision, note: string) {
    const id = prefix + submission_id;
    setError(id);
    try {
      await opts.submitDecision({ submission_id, decision, note });
      await refetch();
      setDeciding((current) => current === deciding ? undefined : current);
    } catch (err) {
      setError(id, errorMessage(err, "The decision was not recorded."));
      throw err;
    }
  }

  return {
    analyzing: new Set(Array.from(analyzing)
      .filter((id) => id.startsWith(prefix))
      .map((id) => id.slice(prefix.length))),
    activeAnalysis: localId(activeAnalysis),
    errors: new Map(Array.from(errors)
      .filter(([id]) => id.startsWith(prefix))
      .map(([id, error]) => [id.slice(prefix.length), error])),
    deciding: localId(deciding?.id),
    analyze,
    openDecide: (id) => setDeciding({ id: prefix + id }),
    closeDecide: () => setDeciding(undefined),
    decide,
  };
}
