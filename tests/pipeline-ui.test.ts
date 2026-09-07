import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);

function load(path: string, overrides: Record<string, unknown> = {}): any {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name: string) => {
    if (name in overrides) return overrides[name];
    if (!name.startsWith(".")) return require(name);
    const local = resolve(dirname(path), name);
    return existsSync(`${local}.tsx`)
      ? load(`${local}.tsx`, overrides)
      : require(`${local}.ts`);
  }, exports);
  return exports;
}

const { Pipeline } = load("src/screens/Pipeline.tsx");
const { SubmissionDetail } = load("src/screens/SubmissionDetail.tsx");
const submissions = ["first", "second"].map((id) => ({
  submission_id: id, applicant_name: id, business_type: "Print shop", state: "WA",
}));
const finding = {
  finding_id: "finding-first", submission_id: "first", recommendation: "request-info",
  risk_score: 42, summary: "The required inspection is missing.",
  cards: [{ category: "claims", status: "pass", note: "One claim in the review window." }],
  missing_info: ["Fire inspection"], conditions: ["Repair the roof"],
};

function mount() {
  const state: any[] = [];
  let cursor = 0;
  const started: string[] = [];
  const finish: Array<{ resolve(): void; reject(error: Error): void }> = [];
  let refreshed = 0;
  const useState = (initial: any) => {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
    return [state[index], (value: any) => {
      state[index] = typeof value === "function" ? value(state[index]) : value;
    }];
  };
  const { useSubmissionActions } = load("src/actions.tsx", {
    react: {
      useState,
      useRef: (current: unknown) => useState({ current })[0],
      useMemo: (factory: () => unknown) => useState(factory)[0],
    },
    "./analyze": { runAnalyzeCommand: async (_client: unknown, id: string) => {
      started.push(id);
      await new Promise<void>((resolve, reject) => finish.push({ resolve, reject }));
    } },
  });
  const actions = () => {
    cursor = 0;
    return useSubmissionActions({ client: {}, refetch: async () => { refreshed++; } });
  };
  const props = () => ({
    submissions, findingBySub: new Map(), actions: actions(), onOpen() {}, loading: null,
  });
  const html = () => renderToStaticMarkup(createElement(Pipeline, props()));
  return { actions, props, html, started, finish, refreshed: () => refreshed };
}

for (const fail of [false, true]) {
  test(`analysis stays serial and releases pending rows after ${fail ? "failure" : "success"}`, async () => {
    const ui = mount();
    ui.actions().analyze("first");
    ui.actions().analyze("first");
    ui.actions().analyze("second");
    assert.equal(ui.actions().analyzing.size, 2);
    await setImmediate();
    assert.deepEqual(ui.started, ["first"]);
    if (fail) ui.finish[0].reject(new Error("Reviewer unavailable"));
    else ui.finish[0].resolve();
    await setImmediate();
    assert.deepEqual(ui.started, ["first", "second"]);
    assert.deepEqual([...ui.actions().analyzing], ["second"]);
    if (fail) assert.match(ui.html(), /Reviewer unavailable/);
    ui.finish[1].resolve();
    await setImmediate();
    assert.equal(ui.actions().analyzing.size, 0);
    assert.equal(ui.refreshed(), fail ? 1 : 2);
  });
}

test("the applicant page keeps the full risk assessment and supporting details", () => {
  const ui = mount();
  const html = renderToStaticMarkup(createElement(SubmissionDetail, {
    role: "underwriter", s: submissions[0], finding, documents: [], events: [],
    actions: ui.actions(), submitting: false, onResubmit() {},
  }));
  for (const text of [finding.summary, "42", finding.cards[0].note, "Fire inspection", "Repair the roof"])
    assert.ok(html.includes(text), text);
});

test("the weather panel is separate from the finding and appears only for the underwriter", () => {
  const ui = mount();
  for (const role of ["underwriter", "broker"]) {
    const html = renderToStaticMarkup(createElement(SubmissionDetail, {
      role, s: submissions[0], finding, documents: [], events: [],
      actions: ui.actions(), submitting: false, onResubmit() {},
      weather: createElement("section", null, "Regional weather report"),
    }));
    assert.equal(html.includes("Regional weather report"), role === "underwriter");
    if (role === "underwriter") assert.ok(html.includes(finding.summary));
  }
});

for (const fail of [false, true]) {
  test(`pipeline distinguishes queued and active analyses through ${fail ? "failure" : "success"}`, async () => {
    const ui = mount();
    ui.actions().analyze("first");
    ui.actions().analyze("second");
    assert.match(ui.html(), /Queued 2…/);
    await setImmediate();
    assert.equal(ui.actions().activeAnalysis, "first");
    assert.match(ui.html(), /Analyzing 1 · 1 queued…/);
    const rows = ui.html().split("<tbody>")[1].split("</tr>");
    assert.match(rows[0], /Analyzing against the underwriting guide…/);
    assert.doesNotMatch(rows[0], /Queued for analysis/);
    assert.match(rows[1], /Queued for analysis…/);
    assert.doesNotMatch(rows[1], /Analyzing against/);
    if (fail) ui.finish[0].reject(new Error("Reviewer unavailable"));
    else ui.finish[0].resolve();
    await setImmediate();
    assert.equal(ui.actions().activeAnalysis, "second");
    assert.match(ui.html(), /Analyzing 1…/);
    ui.finish[1].resolve();
    await setImmediate();
    assert.equal(ui.actions().activeAnalysis, undefined);
    assert.doesNotMatch(ui.html(), /Queued for analysis|Analyzing against/);
  });
}

test("reviewed rows explain the recommendation and lead with the human decision", () => {
  const ui = mount();
  const html = renderToStaticMarkup(createElement(Pipeline, {
    ...ui.props(),
    submissions: [{ ...submissions[0], recommendation: finding.recommendation, analyzed_at: "2026-09-07" }],
    findingBySub: new Map([["first", finding]]),
  }));
  assert.match(html, /Commercial property insurance submissions/);
  assert.ok(html.includes(finding.summary));
  assert.doesNotMatch(html, /<th[^>]*>Risk|<th[^>]*>Missing info/);
  assert.match(html, /class="btn">Decide<\/button>/);
  assert.ok(html.indexOf(">Decide</button>") < html.indexOf(">Re-analyze</button>"));
});

test("pending rows hide stale recommendations and all decision and reply actions", async () => {
  const ui = mount();
  ui.actions().analyze("first");
  await setImmediate();
  const html = renderToStaticMarkup(createElement(Pipeline, {
    ...ui.props(),
    submissions: [{ ...submissions[0], recommendation: finding.recommendation, analyzed_at: "2026-09-07" }],
    findingBySub: new Map([["first", finding]]), onReply() {},
  }));
  assert.ok(!html.includes(finding.summary));
  assert.doesNotMatch(html, />Decide<|>Send reply<|>Re-analyze<|>Request info</);
  ui.finish[0].resolve();
  await setImmediate();
});
