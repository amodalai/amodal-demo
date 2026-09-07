import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";

const dom = new JSDOM("<!doctype html><div id='app'></div>");
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const { AmodalProvider } = await import("@amodalai/react");
const { WeatherAlerts } = await import("./WeatherAlerts");
const container = document.getElementById("app")!;
let root = createRoot(container);
const originalFetch = globalThis.fetch;
afterEach(async () => {
  await act(() => root.unmount());
  root = createRoot(container);
  globalThis.fetch = originalFetch;
});
after(() => dom.window.close());

type Event = Record<string, unknown> & { type: string };
const start = { type: "tool_call_start", tool_name: "weather__alerts_active_area", tool_id: "alerts", parameters: { path: { area: "TX" } } };
const result = { type: "tool_call_result", tool_id: "alerts", status: "success", result: '{"features":[]}' };
const done = { type: "done" };
const response = (events: Event[]) => new Response(events.map((event) =>
  `data: ${JSON.stringify({ ...event, timestamp: "2026-09-07T16:00:00Z" })}\n\n`,
).join(""), { headers: { "Content-Type": "text/event-stream" } });

async function mount(state?: string, scopeId?: string) {
  await act(() => root.render(
    <AmodalProvider runtimeUrl="https://runtime.example">
      <WeatherAlerts key={`${state}:${scopeId}`} state={state} scopeId={scopeId} />
    </AmodalProvider>,
  ));
}

async function click() {
  await act(async () => {
    container.querySelector("button")!.click();
    await setImmediate();
  });
}

test("a successful native lookup displays the report and sends the desk to the weather agent", async () => {
  let body: Record<string, unknown> = {};
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(String(options?.body));
    return response([start, result, { type: "text_delta", content: "No active alerts in Texas." }, { ...done, reason: "model_stop" }]);
  };
  await mount(" tx ", "desk-pacific");
  await click();
  assert.equal(body.agent, "weather");
  assert.equal(body.scope_id, "desk-pacific");
  assert.equal(body.message, "Check active weather alerts for TX.");
  assert.match(container.textContent!, /No active alerts in Texas/);
  assert.match(container.textContent!, /Checked /);
  assert.equal(container.querySelector("a")?.href, "https://api.weather.gov/alerts/active/area/TX");
});

test("earlier steps omit scope and a refresh starts a fresh weather session", async () => {
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(String(options?.body)));
    return response([start, result, { type: "text_delta", content: "No active alerts." }, done]);
  };
  await mount("TX");
  await click();
  await click();
  assert.equal(bodies.length, 2);
  for (const body of bodies) {
    assert.equal("scope_id" in body, false);
    assert.equal("session_id" in body, false);
  }
});

for (const state of [undefined, "", "Texas", "ZZ"]) {
  test(`does not request weather for unsupported state ${state}`, async () => {
    globalThis.fetch = async () => { throw new Error("Unexpected request"); };
    await mount(state);
    assert.equal(container.querySelector("button"), null);
    assert.match(container.textContent!, /valid US state or territory code/);
  });
}

for (const events of [
  [{ type: "error", message: "Weather service unavailable" }],
  [start, { ...result, status: "error", error: "NWS unavailable" }, { type: "text_delta", content: "No active alerts." }, done],
  [{ type: "text_delta", content: "No active alerts." }, done],
  [start, result, done],
  [{ ...start, parameters: { path: { area: "OR" } } }, result, { type: "text_delta", content: "No active alerts." }, done],
  [start, result, { type: "text_delta", content: "No active alerts." }],
  ...["max_turns", "user_abort", "error", "budget_exceeded", "loop_detected"].map((reason) =>
    [start, result, { type: "text_delta", content: "No active alerts." }, { ...done, reason }]),
]) {
  test(`a failed or unverified report is not presented as a weather result: ${JSON.stringify(events)}`, async () => {
    globalThis.fetch = async () => response(events);
    await mount("TX");
    await click();
    assert.ok(container.querySelector(".error"));
    assert.doesNotMatch(container.textContent!, /No active alerts|Checked /);
    assert.equal(container.querySelector("button")!.disabled, false);
  });
}

test("a desk change aborts the active request and clears its report", async () => {
  let signal: AbortSignal | null | undefined;
  globalThis.fetch = async (_url, options) => {
    signal = options?.signal;
    return new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  };
  await mount("TX", "desk-pacific");
  await click();
  assert.equal(container.querySelector("button")!.disabled, true);
  await mount("TX", "desk-atlantic");
  assert.equal(signal?.aborted, true);
  assert.doesNotMatch(container.textContent!, /Checking weather alerts|Checked /);
  assert.equal(container.querySelector(".error"), null);
});

test("a completed report is cleared when the property's state changes", async () => {
  globalThis.fetch = async () => response([start, result, { type: "text_delta", content: "Texas report" }, done]);
  await mount("TX", "desk-pacific");
  await click();
  assert.match(container.textContent!, /Texas report/);
  await mount("OR", "desk-pacific");
  assert.doesNotMatch(container.textContent!, /Texas report|Checked /);
  assert.match(container.textContent!, /Weather alerts · OR/);
});
