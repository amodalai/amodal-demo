import { useMemo, useRef, useState } from "react";
import type { RuntimeClient } from "@amodalai/react";
import type { Decision } from "../amodal/_lib/decision";
import { runAnalyzeCommand } from "./analyze";
import { serial } from "./serial";
import { errorMessage } from "./tools";

export interface SubmissionActionsApi {
  /** Submissions with an analysis in flight or waiting in the queue. */
  analyzing: ReadonlySet<string>;
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
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [deciding, setDeciding] = useState<string | undefined>();
  const queue = useMemo(serial, []);
  const pending = useRef(new Set<string>());

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
    if (pending.current.has(submission_id)) return;
    pending.current.add(submission_id);
    mark(submission_id, true);
    setError(submission_id);
    void queue(async () => {
      try {
        await runAnalyzeCommand(client, submission_id, scopeId);
        await refetch();
      } catch (err) {
        setError(submission_id, errorMessage(err, "Analysis failed."));
      } finally {
        pending.current.delete(submission_id);
        mark(submission_id, false);
      }
    });
  }

  async function decide(submission_id: string, decision: Decision, note: string) {
    setError(submission_id);
    try {
      await opts.submitDecision({ submission_id, decision, note });
      await refetch();
      setDeciding(undefined);
    } catch (err) {
      setError(submission_id, errorMessage(err, "The decision was not recorded."));
      throw err;
    }
  }

  return {
    analyzing,
    errors,
    deciding,
    analyze,
    openDecide: setDeciding,
    closeDecide: () => setDeciding(undefined),
    decide,
  };
}
