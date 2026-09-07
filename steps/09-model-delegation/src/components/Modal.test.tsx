import assert from "node:assert/strict";
import { test } from "node:test";
import { Modal } from "./Modal";

for (const busy of [false, true]) {
  test(`${busy ? "busy" : "idle"} modal handles backdrop and content clicks`, () => {
    let canceled = 0;
    const dialog = Modal({
      title: "Send reply",
      busy,
      confirmLabel: "Send",
      busyLabel: "Sending…",
      onCancel: () => canceled++,
      onConfirm() {},
    });

    let stopped = false;
    dialog.props.children.props.onClick({ stopPropagation: () => { stopped = true; } });
    assert.equal(stopped, true, "content clicks do not reach the backdrop");
    assert.equal(canceled, 0);

    dialog.props.onClick?.();
    assert.equal(canceled, busy ? 0 : 1, "busy dialogs stay open on backdrop clicks");
  });
}
