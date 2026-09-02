import assert from "node:assert/strict";
import { test } from "node:test";
import { loadDeclarations } from "./extract.js";
import { SRC_DIRS } from "./helpers.js";

test("runTool accepts only complete outcomes in every app copy", async () => {
  for (const dir of SRC_DIRS) {
    const { runTool } = await loadDeclarations<{
      runTool(
        launcher: { run(input: unknown): Promise<unknown> },
        input: unknown,
      ): Promise<unknown>;
    }>(["runTool"], [`${dir}/tools.ts`, `${dir}/App.tsx`]);

    const run = (kind: string) =>
      runTool(
        {
          run: async () => ({
            outcome: { kind, reason: `Tool "reset_demo" failed: ${kind}` },
            result: "done",
          }),
        },
        {},
      );

    assert.equal(await run("complete"), "done", dir);
    for (const kind of ["failed", "cancelled", "paused", "review-pending"]) {
      await assert.rejects(run(kind), { message: kind }, `${dir}: ${kind}`);
    }
  }
});
