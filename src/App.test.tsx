import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { after, afterEach, beforeEach, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import ts from "typescript";
import type { Pipeline } from "./types";

const dom = new JSDOM("<!doctype html><div id='app'></div>", { url: "https://demo.example/" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const { createRoot } = await import("react-dom/client");
const sdk = await import("@amodalai/react");
const require = createRequire(import.meta.url);
const quiet = () => null;
const overrides: Record<string, unknown> = {
  "@amodalai/react": { ...sdk, ChatWidget: quiet },
  "./components/AutoSyncToggle": { AutoSyncToggle: quiet },
  "./components/WeatherAlerts": { WeatherAlerts: quiet },
  "./screens/Guide": { Guide: quiet },
};
const modules = new Map<string, any>();
function load(path: string): any {
  if (modules.has(path)) return modules.get(path);
  const exports = {};
  modules.set(path, exports);
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "exports", compiled)((name: string) => {
    if (name in overrides) return overrides[name];
    if (!name.startsWith(".")) return require(name);
    const local = resolve(dirname(path), name.replace(/\.js$/, ""));
    return load(existsSync(`${local}.tsx`) ? `${local}.tsx` : `${local}.ts`);
  }, exports);
  return exports;
}
const App = load(new URL("./App.tsx", import.meta.url).pathname).default;
const container = document.getElementById("app")!;
let root = createRoot(container);
const originalFetch = globalThis.fetch;
const pacific = "desk-pacific";
const atlantic = "desk-atlantic";
const submission = {
  submission_id: "shared", applicant_name: "Shared applicant", business_type: "Print shop",
  analyzed_at: "2026-09-07", recommendation: "ready-to-quote", broker_email: "broker@example.com",
};
const finding = {
  finding_id: "finding-shared", submission_id: "shared", recommendation: "ready-to-quote",
  risk_score: 20, summary: "Within appetite", missing_info: [], conditions: [],
};
type Request = { tool: string; scope: string; input: Record<string, unknown> };
let pipelines: Map<string, Pipeline>;
let requests: Request[];
let handle: (request: Request) => Promise<unknown>;
let analyze: (scope: string, id: string) => Promise<void>;
const completion = (result: unknown) => new Response(JSON.stringify({
  sessionId: "session", outcome: { kind: "complete" }, result,
}), { headers: { "Content-Type": "application/json" } });
const releases: Array<() => void> = [];
function deferred<T>(fallback: T) {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  releases.push(() => resolve(fallback));
  return { promise, resolve, reject };
}
const flush = () => setImmediate();
const buttons = (label: string) => [...container.querySelectorAll("button")].filter((b) => b.textContent === label);
async function click(label: string) {
  const button = buttons(label)[0];
  assert.ok(button, `button ${label} exists`);
  await act(async () => { button.click(); await flush(); });
}
async function mount(role = "underwriter") {
  localStorage.setItem("uw-persona", role);
  window.location.hash = role === "broker" ? "#/new" : "#/pipeline";
  await act(async () => {
    root.render(createElement(sdk.AmodalProvider, { runtimeUrl: "https://runtime.example", children: createElement(App) }));
    await flush();
  });
}
async function pickDesk(desk: string) {
  await act(async () => {
    const select = container.querySelector<HTMLSelectElement>("select.desk")!;
    select.value = desk;
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await flush();
  });
}
async function file() {
  await act(() => {
    for (const input of container.querySelectorAll<HTMLInputElement>(".form .field input")) {
      const value = input.closest("label")?.textContent;
      if (value !== "Applicant" && value !== "Business type") continue;
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, value === "Applicant" ? "Filed applicant" : "Print shop");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    }
  });
  await click("File submission");
}

beforeEach(() => {
  localStorage.clear();
  pipelines = new Map([pacific, atlantic].map((desk) => [desk, {
    submissions: [{ ...submission }], findings: [{ ...finding }], documents: [], events: [],
  }]));
  requests = [];
  handle = async ({ tool, scope }) => tool === "list_pipeline" ? pipelines.get(scope) : {};
  analyze = async () => {};
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(String(options?.body));
    const path = new URL(String(url)).pathname;
    if (path === "/chat") {
      const id = body.message.replace(/^analyze /, "");
      await analyze(body.scope_id, id);
      return new Response([
        { type: "tool_call_start", tool_name: "analyze_submission", tool_id: "analysis" },
        { type: "tool_call_result", tool_id: "analysis", status: "success", result: '{"found":true}' },
      ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
    }
    assert.match(path, /^\/api\/tools\/[^/]+\/run$/);
    const request = { tool: path.split("/")[3], scope: body.scope_id, input: body.input };
    requests.push(request);
    return completion(await handle(request));
  };
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    releases.splice(0).forEach((release) => release());
    await flush();
  });
  root = createRoot(container);
  globalThis.fetch = originalFetch;
});
after(() => dom.window.close());

test("loading a desk displays its rows and switching uses the other scope", async () => {
  pipelines.get(atlantic)!.submissions[0].applicant_name = "Atlantic applicant";
  await mount();
  assert.match(container.textContent!, /Shared applicant/);
  await pickDesk(atlantic);
  assert.match(container.textContent!, /Atlantic applicant/);
  assert.deepEqual(requests.map(({ tool, scope }) => [tool, scope]), [
    ["list_pipeline", pacific], ["list_pipeline", atlantic],
  ]);
});

test("filing on the current desk refreshes and opens the returned submission", async () => {
  handle = async ({ tool, scope }) => tool === "list_pipeline" ? pipelines.get(scope) : { submission_id: "filed" };
  await mount("broker");
  await file();
  assert.equal(requests.find((r) => r.tool === "submit_submission")?.scope, pacific);
  assert.equal(window.location.hash, "#/submission/filed");
  assert.equal(requests.filter((r) => r.tool === "list_pipeline").length, 2);
});

for (const action of ["send", "reset", "decide"]) {
  test(`${action} on the current desk refreshes and closes its confirmation`, async () => {
    await mount();
    await click(action === "send" ? "Send reply" : action === "reset" ? "Reset demo data" : "Decide");
    assert.ok(container.querySelector("[role=dialog]"));
    await click(action === "send" ? "Confirm & send" : action === "reset" ? "Reset" : "Record decision");
    assert.equal(Boolean(container.querySelector("[role=dialog]")), false);
    assert.equal(requests.filter((r) => r.tool === "list_pipeline").length, 2);
  });
}

test("each desk queues shared submission IDs and only displays its own analysis state", async () => {
  for (const pipeline of pipelines.values()) pipeline.submissions[0].analyzed_at = "";
  const pending = deferred<void>(undefined);
  const started: string[] = [];
  analyze = async (scope) => {
    started.push(scope);
    if (scope === pacific) await pending.promise;
    pipelines.get(scope)!.submissions[0].analyzed_at = "2026-09-07";
  };
  await mount();
  assert.deepEqual(started, [pacific]);
  await pickDesk(atlantic);
  assert.match(container.textContent!, /Queued for analysis/);
  assert.doesNotMatch(container.textContent!, /Analyzing against/);
  await act(async () => { pending.reject(new Error("Pacific analysis failed")); await flush(); });
  assert.deepEqual(started, [pacific, atlantic]);
  assert.doesNotMatch(container.textContent!, /Pacific analysis failed|Queued for analysis/);
  await pickDesk(pacific);
  assert.match(container.textContent!, /Pacific analysis failed/);
  assert.deepEqual(started, [pacific, atlantic], "revisiting preserves the desk's triage state");
});

for (const label of ["Decide", "Reset demo data"]) {
  test(`switching desks closes the ${label} confirmation`, async () => {
    await mount();
    await click(label);
    assert.ok(container.querySelector("[role=dialog]"));
    await pickDesk(atlantic);
    assert.equal(Boolean(container.querySelector("[role=dialog]")), false);
  });
}

for (const revisit of [false, true]) {
  test(`an old filing cannot navigate after ${revisit ? "returning to" : "leaving"} its desk`, async () => {
    const pending = deferred<unknown>({ submission_id: "filed" });
    const ordinary = handle;
    handle = (request) => request.tool === "submit_submission" ? pending.promise : ordinary(request);
    await mount("broker");
    await file();
    await pickDesk(atlantic);
    if (revisit) await pickDesk(pacific);
    await act(async () => { pending.resolve({ submission_id: "filed" }); await flush(); });
    assert.equal(window.location.hash, "#/new");
    assert.equal(requests.filter((r) => r.tool === "list_pipeline").length, revisit ? 3 : 2);
  });
}

for (const action of ["send", "reset", "decide"]) {
  test(`an old ${action} completion cannot dismiss the current desk's confirmation`, async () => {
    const tool = action === "send" ? "send_outcome" : action === "reset" ? "reset_demo" : "decide_submission";
    const open = action === "send" ? "Send reply" : action === "reset" ? "Reset demo data" : "Decide";
    const confirm = action === "send" ? "Confirm & send" : action === "reset" ? "Reset" : "Record decision";
    const pending = deferred<unknown>({});
    const ordinary = handle;
    handle = (request) => request.tool === tool && request.scope === pacific ? pending.promise : ordinary(request);
    await mount();
    await click(open);
    await click(confirm);
    await pickDesk(atlantic);
    if (!container.querySelector("[role=dialog]")) await click(open);
    await act(async () => { pending.resolve({}); await flush(); });
    assert.ok(container.querySelector("[role=dialog]"));
    assert.equal(requests.filter((r) => r.tool === "list_pipeline").length, 2);
  });
}

for (const tool of ["submit_submission", "send_outcome", "reset_demo", "decide_submission", "sync_submissions", "seed_examples"]) {
  test(`a delayed ${tool} failure stays on its originating desk`, async () => {
    const pending = deferred<unknown>({});
    const ordinary = handle;
    handle = (request) => request.tool === tool && request.scope === pacific ? pending.promise : ordinary(request);
    if (tool === "seed_examples") pipelines.get(pacific)!.submissions = [];
    await mount(tool === "submit_submission" ? "broker" : "underwriter");
    if (tool === "submit_submission") await file();
    else if (tool === "sync_submissions") await click("Sync inbox");
    else if (tool !== "seed_examples") {
      await click(tool === "send_outcome" ? "Send reply" : tool === "reset_demo" ? "Reset demo data" : "Decide");
      await click(tool === "send_outcome" ? "Confirm & send" : tool === "reset_demo" ? "Reset" : "Record decision");
    }
    await pickDesk(atlantic);
    if (tool === "send_outcome") await click("Send reply");
    if (tool === "reset_demo" && !container.querySelector("[role=dialog]")) await click("Reset demo data");
    if (tool === "decide_submission" && !container.querySelector("[role=dialog]")) await click("Decide");
    await act(async () => { pending.reject(new Error("Pacific request failed")); await flush(); });
    assert.doesNotMatch(container.textContent!, /Pacific request failed/);
    if (tool === "seed_examples") {
      await pickDesk(pacific);
      assert.equal(requests.filter((r) => r.tool === "seed_examples").length, 2);
    }
  });
}

for (const action of ["file", "send", "reset"]) {
  test(`switching during the ${action} refresh ignores its final UI update`, async () => {
    const pending = deferred<unknown>({});
    const ordinary = handle;
    let reads = 0;
    handle = (request) => {
      if (request.tool === "list_pipeline" && request.scope === pacific && ++reads === 2) return pending.promise;
      if (request.tool === "submit_submission") return Promise.resolve({ submission_id: "filed" });
      return ordinary(request);
    };
    await mount(action === "file" ? "broker" : "underwriter");
    if (action === "file") await file();
    else {
      await click(action === "send" ? "Send reply" : "Reset demo data");
      await click(action === "send" ? "Confirm & send" : "Reset");
    }
    assert.equal(reads, 2);
    await pickDesk(atlantic);
    if (action !== "file") await click(action === "send" ? "Send reply" : "Reset demo data");
    await act(async () => { pending.resolve(pipelines.get(pacific)); await flush(); });
    if (action === "file") assert.equal(window.location.hash, "#/new");
    else assert.ok(container.querySelector("[role=dialog]"));
  });
}
