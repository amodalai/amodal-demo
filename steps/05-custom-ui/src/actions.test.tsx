import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import ts from "typescript";
import type { SubmissionActionsApi } from "./actions";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL("./actions.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

test("scope changes isolate actions without dropping queued work", async () => {
  const state: any[] = [];
  let cursor = 0;
  const useState = (initial: any) => {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
    return [state[index], (value: any) => {
      state[index] = typeof value === "function" ? value(state[index]) : value;
    }];
  };
  const started: string[] = [];
  const finish: Array<{ resolve(): void; reject(error: Error): void }> = [];
  const exports: { useSubmissionActions?: (options: unknown) => SubmissionActionsApi } = {};
  new Function("require", "exports", compiled)((name: string) => {
    if (name === "react") return {
      useState,
      useRef: (value: unknown) => useState({ current: value })[0],
      useMemo: (factory: () => unknown) => useState(factory)[0],
    };
    if (name === "./analyze") return { runAnalyzeCommand: async (_client: unknown, _id: string, scope: string) => {
      started.push(scope);
      await new Promise<void>((resolve, reject) => finish.push({ resolve, reject }));
    } };
    return require(`${name}.ts`);
  }, exports);
  const actions = (scopeId: string) => {
    cursor = 0;
    return exports.useSubmissionActions!({ client: {}, scopeId, refetch: async () => {}, submitDecision: async () => {} });
  };

  actions("pacific").analyze("shared");
  actions("pacific").openDecide("shared");
  await setImmediate();
  assert.equal(actions("atlantic").analyzing.size, 0);
  assert.equal(actions("atlantic").deciding, undefined);
  actions("atlantic").analyze("shared");
  actions("atlantic").openDecide("shared");
  assert.equal(actions("atlantic").activeAnalysis, undefined);
  assert.deepEqual([...actions("atlantic").analyzing], ["shared"]);
  finish[0].reject(new Error("Pacific analysis failed"));
  await setImmediate();
  assert.deepEqual(started, ["pacific", "atlantic"]);
  assert.equal(actions("atlantic").errors.size, 0);
  assert.equal(actions("atlantic").deciding, "shared");
  finish[1].resolve();
  await setImmediate();
  assert.equal(actions("atlantic").analyzing.size, 0);
  assert.equal(actions("pacific").errors.get("shared"), "Pacific analysis failed");
});
