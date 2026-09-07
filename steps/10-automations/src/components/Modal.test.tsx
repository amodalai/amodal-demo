import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Modal } from "./Modal";

const dom = new JSDOM("<!doctype html><div id='app'></div>");
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const container = document.getElementById("app")!;
let root = createRoot(container);
afterEach(async () => {
  await act(() => root.unmount());
  root = createRoot(container);
});
after(() => dom.window.close());

for (const busy of [false, true]) {
  test(`${busy ? "busy" : "idle"} modal respects cancellation and confirmation availability`, async () => {
    let canceled = 0;
    let confirmed = 0;
    await act(() => root.render(
      <Modal
        title="Send reply"
        busy={busy}
        confirmLabel="Send"
        busyLabel="Sending…"
        onCancel={() => canceled++}
        onConfirm={() => confirmed++}
      >
        <p>Reply preview</p>
      </Modal>,
    ));

    await act(() => container.querySelector("p")!.click());
    assert.equal(canceled, 0, "clicking the contents leaves the dialog open");

    const [cancel, confirm] = container.querySelectorAll("button");
    await act(() => confirm.click());
    assert.equal(confirmed, busy ? 0 : 1);
    assert.equal(canceled, 0, "confirmation does not bubble to the backdrop");

    await act(() => cancel.click());
    assert.equal(canceled, busy ? 0 : 1);

    await act(() => container.querySelector<HTMLElement>("[role=dialog]")!.click());
    assert.equal(canceled, busy ? 0 : 2, "the backdrop follows the Cancel button");
  });
}
