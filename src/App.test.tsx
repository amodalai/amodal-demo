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
let endChat: () => void;
const overrides: Record<string, unknown> = {
  "@amodalai/react": { ...sdk, ChatWidget: ({ onStreamEnd }: { onStreamEnd: () => void }) => { endChat = onStreamEnd; return null; } },
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
let readStore: (store: string) => Promise<unknown[]>;
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
async function mount(role = "underwriter", app = App, hash = role === "broker" ? "#/new" : "#/pipeline") {
  localStorage.setItem("uw-persona", role);
  window.location.hash = hash;
  await act(async () => {
    root.render(createElement(sdk.AmodalProvider, { runtimeUrl: "https://runtime.example", children: createElement(app) }));
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
  readStore = async (store) => {
    const field = store === "risk_findings" ? "findings" : store as keyof Pipeline;
    return pipelines.get(pacific)![field];
  };
  globalThis.fetch = async (url, options) => {
    const body = options?.body ? JSON.parse(String(options.body)) : {};
    const path = new URL(String(url)).pathname;
    if (path.startsWith("/api/stores/")) {
      const store = path.split("/")[3];
      requests.push({ tool: `read:${store}`, scope: "", input: {} });
      return new Response(JSON.stringify({ documents: (await readStore(store)).map((payload, i) => ({ key: String(i), payload })) }), {
        headers: { "Content-Type": "application/json" },
      });
    }
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

const steps = [
  "05-custom-ui", "06-guardrail-hooks", "07-gmail-connection", "08-custom-tool",
  "09-model-delegation", "10-automations", "11-memory-and-surfaces",
];
const stepApps = steps.map((step) => ({
  step, app: load(new URL(`../steps/${step}/src/App.tsx`, import.meta.url).pathname).default,
}));
for (const { step, app } of stepApps) {
  test(`${step}: a complete store read displays the pipeline`, async () => {
    await mount("underwriter", app);
    assert.match(container.textContent!, /Shared applicant/);
    assert.equal(requests.filter((r) => r.tool.startsWith("read:")).length, 4);
  });
}

test("a failed desk read reports its error and retry replaces the error with rows", async () => {
  const ordinary = handle;
  handle = async () => { throw new Error("Reads unavailable"); };
  await mount();
  assert.match(container.textContent!, /Reads unavailable/);
  assert.doesNotMatch(container.textContent!, /No submissions on this desk|dataset loads itself/);
  assert.equal(requests.filter((r) => r.tool === "seed_examples").length, 0);
  handle = ordinary;
  await click("Retry");
  assert.match(container.textContent!, /Shared applicant/);
  assert.doesNotMatch(container.textContent!, /Reads unavailable/);
});

test("a failed deep-link read does not claim the submission is absent", async () => {
  handle = async () => { throw new Error("Reads unavailable"); };
  await mount("underwriter", App, "#/submission/shared");
  assert.match(container.textContent!, /Reads unavailable/);
  assert.doesNotMatch(container.textContent!, /That submission is not on this desk/);
});

test("a chat refresh failure keeps cached rows and offers a read retry", async () => {
  await mount();
  const ordinary = handle;
  handle = async () => { throw new Error("Reads unavailable"); };
  await act(async () => { endChat(); await flush(); });
  assert.match(container.textContent!, /Shared applicant/);
  assert.match(container.textContent!, /Reads unavailable/);
  handle = ordinary;
  await click("Retry");
  assert.doesNotMatch(container.textContent!, /Reads unavailable/);
});

test("an older read failure cannot replace a newer successful refresh", async () => {
  await mount();
  const pending = deferred<unknown>({});
  const ordinary = handle;
  let reads = 0;
  handle = (request) => request.tool === "list_pipeline" && ++reads === 1 ? pending.promise : ordinary(request);
  await act(async () => { endChat(); await flush(); });
  pipelines.get(pacific)!.submissions[0].applicant_name = "Latest applicant";
  await act(async () => { endChat(); await flush(); });
  assert.match(container.textContent!, /Latest applicant/);
  await act(async () => { pending.reject(new Error("Older read failed")); await flush(); });
  assert.match(container.textContent!, /Latest applicant/);
  assert.doesNotMatch(container.textContent!, /Older read failed/);
});

test("changing desks clears read errors and late errors remain scoped", async () => {
  const pending = deferred<unknown>({});
  const ordinary = handle;
  handle = (request) => request.scope === pacific ? pending.promise : ordinary(request);
  await mount();
  await pickDesk(atlantic);
  await act(async () => { pending.reject(new Error("Pacific read failed")); await flush(); });
  assert.doesNotMatch(container.textContent!, /Pacific read failed/);
  await pickDesk(pacific);
  assert.match(container.textContent!, /Pacific read failed/);
  await pickDesk(atlantic);
  assert.doesNotMatch(container.textContent!, /Pacific read failed/);
});

for (const { step, app } of stepApps) {
  for (const store of ["submissions", "risk_findings", "documents", "events"]) {
    test(`${step}: failed ${store} reads report an error and recover with Retry`, async () => {
      const ordinary = readStore;
      readStore = async (name) => {
        if (name === store) throw new Error("Reads unavailable");
        return ordinary(name);
      };
      await mount("underwriter", app);
      assert.match(container.textContent!, /Reads unavailable/);
      assert.doesNotMatch(container.textContent!, /No submissions on this desk|dataset loads itself/);
      readStore = ordinary;
      await click("Retry");
      assert.match(container.textContent!, /Shared applicant/);
      assert.doesNotMatch(container.textContent!, /Reads unavailable/);
      assert.equal(requests.filter((r) => r.tool.startsWith("read:")).length, 8);
    });
  }

  test(`${step}: a failed document read cannot expose an empty resubmission packet`, async () => {
    const ordinary = readStore;
    readStore = async (name) => {
      if (name === "documents") throw new Error("Reads unavailable");
      return ordinary(name);
    };
    await mount("broker", app, "#/submission/shared");
    assert.equal(buttons("Resubmit").length, 0);
    assert.doesNotMatch(container.textContent!, /That submission is not on this desk/);
    assert.match(container.textContent!, /Reads unavailable/);
  });

  for (const waiting of [false, true]) {
    test(`${step}: automatic analysis waits for all reads to ${waiting ? "finish" : "succeed"}`, async () => {
      pipelines.get(pacific)!.submissions[0].analyzed_at = "";
      const pending = deferred<unknown[]>([]);
      const ordinary = readStore;
      readStore = async (name) => {
        if (name === "documents") {
          if (waiting) return pending.promise;
          throw new Error("Reads unavailable");
        }
        return ordinary(name);
      };
      let analyses = 0;
      analyze = async () => {
        analyses++;
        pipelines.get(pacific)!.submissions[0].analyzed_at = "2026-09-07";
      };
      await mount("underwriter", app);
      assert.equal(analyses, 0);
      readStore = ordinary;
      if (waiting) await act(async () => { pending.resolve([]); await flush(); });
      else await click("Retry");
      assert.equal(analyses, 1);
    });
  }

  test(`${step}: incomplete store reads cannot seed an apparently empty pipeline`, async () => {
    pipelines.get(pacific)!.submissions = [];
    const ordinary = readStore;
    readStore = async (name) => {
      if (name === "events") throw new Error("Reads unavailable");
      return ordinary(name);
    };
    await mount("underwriter", app);
    assert.equal(requests.filter((r) => r.tool === "seed_examples").length, 0);
    readStore = ordinary;
    await click("Retry");
    assert.equal(requests.filter((r) => r.tool === "seed_examples").length, 1);
  });

  test(`${step}: a failed refresh retains the complete cached pipeline`, async () => {
    await mount("underwriter", app);
    const ordinary = readStore;
    readStore = async () => { throw new Error("Reads unavailable"); };
    await act(async () => { endChat(); await flush(); });
    assert.match(container.textContent!, /Shared applicant/);
    assert.match(container.textContent!, /Reads unavailable/);
    assert.doesNotMatch(container.textContent!, /No submissions on this desk|dataset loads itself/);
    readStore = ordinary;
    await click("Retry");
    assert.doesNotMatch(container.textContent!, /Reads unavailable/);
  });
}

test("Send reply submits the exact recipient, subject, and body displayed for confirmation", async () => {
  pipelines.get(pacific)!.submissions[0].broker_email = ` ${submission.broker_email} `;
  await mount();
  await click("Send reply");
  const fields = container.querySelectorAll(".modal__fields dd");
  const reviewed = {
    to: fields[0].textContent, subject: fields[1].textContent,
    body: container.querySelector(".modal__body")!.textContent,
  };
  assert.equal(reviewed.to, submission.broker_email);
  await click("Confirm & send");
  assert.deepEqual(requests.find(({ tool }) => tool === "send_outcome")?.input, {
    submission_id: submission.submission_id, confirmation: reviewed,
  });
});

test("a reply changed in another tab is rejected and leaves the confirmation open with recovery guidance", async () => {
  const send = load(new URL("../amodal/tools/send_outcome/handler.ts", import.meta.url).pathname).default;
  const sent: unknown[] = [];
  const ordinary = handle;
  handle = async (request) => {
    if (request.tool !== "send_outcome") return ordinary(request);
    const pipeline = pipelines.get(request.scope)!;
    return send(request.input, {
      log: () => {}, signal: new AbortController().signal,
      async callTool(name: string, args: Record<string, unknown>) {
        if (name === "store__submissions__get") return pipeline.submissions[0];
        if (name === "store__risk_findings__get") return pipeline.findings[0];
        if (name === "send_message") sent.push(args);
        return {};
      },
    });
  };
  await mount();
  await click("Send reply");
  pipelines.get(pacific)!.submissions[0] = { ...submission, broker_email: "changed@example.invalid", decision: "decline" };
  await click("Confirm & send");
  assert.deepEqual(sent, []);
  assert.ok(container.querySelector("[role=dialog]"));
  assert.match(container.textContent!, /reply changed.*refresh.*reopen Send reply/);
});
