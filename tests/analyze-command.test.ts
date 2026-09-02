import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDeclarations } from "./extract.js";

type AnalyzeEvent = Record<string, unknown> & { type: string };

const { runAnalyzeCommand } = await loadDeclarations<{
  runAnalyzeCommand(
    client: unknown,
    submission_id: string,
    scopeId?: string,
  ): Promise<void>;
}>(["runAnalyzeCommand"], ["src/analyze.ts", "src/App.tsx"]);

/** A RuntimeClient stand-in whose stream reports how far the command read into it. */
function fakeClient(events: AnalyzeEvent[]) {
  const state = { consumed: 0, prompt: "", scopeId: "", scoped: false };
  return {
    state,
    client: {
      async *chatStream(prompt: string, opts: { scopeId?: string }) {
        state.prompt = prompt;
        state.scopeId = opts.scopeId ?? "";
        state.scoped = "scopeId" in opts;
        for (const ev of events) {
          state.consumed += 1;
          yield ev;
        }
      },
    },
  };
}

const started = { type: "tool_call_start", tool_name: "analyze_submission", tool_id: "t1" };
const result = (extra: Record<string, unknown>) => ({
  type: "tool_call_result",
  tool_id: "t1",
  ...extra,
});

test("returns on the analyze result and stops reading the stream", async () => {
  const { client, state } = fakeClient([
    { type: "text", text: "working" },
    started,
    result({ status: "ok", result: JSON.stringify({ found: true }) }),
    { type: "error", message: "narration blew up after the save" },
  ]);
  await runAnalyzeCommand(client, "sub_bistro_ember", "desk-pacific");
  assert.equal(state.prompt, "analyze sub_bistro_ember");
  assert.equal(state.scopeId, "desk-pacific");
  assert.equal(state.consumed, 3, "the post-result narration is not consumed");
});

test("an unscoped call sends no scopeId at all", async () => {
  const { client, state } = fakeClient([
    started,
    result({ status: "ok", result: JSON.stringify({ found: true }) }),
  ]);
  await runAnalyzeCommand(client, "sub_x");
  assert.equal(state.scoped, false);
});

test("ignores a tool_call_result from another tool", async () => {
  const { client, state } = fakeClient([
    { type: "tool_call_start", tool_name: "claims_stats", tool_id: "other" },
    { type: "tool_call_result", tool_id: "other", status: "error", error: "unrelated" },
    started,
    result({ status: "ok", result: JSON.stringify({ found: true }) }),
  ]);
  await runAnalyzeCommand(client, "sub_bistro_ember", "d");
  assert.equal(state.consumed, 4);
});

test("throws the tool error when the analyze call fails", async () => {
  const { client } = fakeClient([started, result({ status: "error", error: "reviewer timed out" })]);
  await assert.rejects(runAnalyzeCommand(client, "sub_x", "d"), /reviewer timed out/);
});

test("throws a fallback message when the tool error is not a string", async () => {
  const { client } = fakeClient([started, result({ status: "error", error: { code: 500 } })]);
  await assert.rejects(runAnalyzeCommand(client, "sub_x", "d"), /Analysis failed\./);
});

test("throws when the result reports the submission was not found", async () => {
  const { client } = fakeClient([
    started,
    result({ status: "ok", result: JSON.stringify({ found: false }) }),
  ]);
  await assert.rejects(runAnalyzeCommand(client, "sub_ghost", "d"), /sub_ghost not found/);
});

test("an unparseable result is left to the store refetch", async () => {
  const { client } = fakeClient([started, result({ status: "ok", result: "not json" })]);
  await runAnalyzeCommand(client, "sub_x", "d");
});

test("throws on a stream error event", async () => {
  const { client } = fakeClient([{ type: "error", message: "stream closed" }]);
  await assert.rejects(runAnalyzeCommand(client, "sub_x", "d"), /stream closed/);
});

test("throws a fallback message on an empty stream error event", async () => {
  const { client } = fakeClient([{ type: "error", message: "" }]);
  await assert.rejects(runAnalyzeCommand(client, "sub_x", "d"), /Analysis failed\./);
});

test("a stream that never reports the tool resolves without throwing", async () => {
  const { client } = fakeClient([{ type: "text", text: "no tool ran" }]);
  await runAnalyzeCommand(client, "sub_x", "d");
});
