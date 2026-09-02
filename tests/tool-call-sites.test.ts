import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { SRC_DIRS } from "./helpers.js";

/**
 * The SDK resolves a failed tool run instead of rejecting it, so a lane's own
 * `run` reports a `failed`, `cancelled`, `paused` or `review-pending` outcome as
 * a success. `runTool` (tools.ts) is the one place that turns those back into
 * rejections, so it is the one place allowed to call `run`: a call site that
 * skips it closes its modal and refreshes as if the action had happened, and
 * `send_outcome` emails a broker.
 */
for (const dir of SRC_DIRS) {
  test(`${dir} runs every tool lane through runTool`, () => {
    const direct = readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((f) => /\.tsx?$/.test(f) && f !== "tools.ts")
      .filter((f) => /\w\.run\(/.test(readFileSync(`${dir}/${f}`, "utf8")));
    assert.deepEqual(direct, [], `${dir}: only runTool may call a lane's run()`);
  });
}
