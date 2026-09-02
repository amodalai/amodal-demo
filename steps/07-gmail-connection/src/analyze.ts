import type { RuntimeClient } from "@amodalai/react";

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
export async function runAnalyzeCommand(
  client: RuntimeClient,
  submission_id: string,
  scopeId?: string,
): Promise<void> {
  const analyzeCallIds = new Set<string>();
  for await (const ev of client.chatStream(`analyze ${submission_id}`, {
    agent: "default",
    // Scoping arrives with the desks in step 12; before that the run is
    // unscoped and the option must be absent, not undefined.
    ...(scopeId ? { scopeId } : {}),
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
