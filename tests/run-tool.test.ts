import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";

const APPS = [
  "src/App.tsx",
  ...Array.from({ length: 7 }, (_, i) =>
    `steps/${String(i + 5).padStart(2, "0")}-${[
      "custom-ui",
      "guardrail-hooks",
      "gmail-connection",
      "custom-tool",
      "model-delegation",
      "automations",
      "memory-and-surfaces",
    ][i]}/src/App.tsx`,
  ),
];

async function loadRunTool(path: string) {
  const source = await readFile(path, "utf8");
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = file.statements.find(
    (node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === "runTool",
  );
  assert.ok(declaration, `${path} declares runTool`);
  const code = ts.transpileModule(
    declaration.getText(file).replace("async function", "export async function"),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  return module.runTool as (
    launcher: { run(input: unknown): Promise<unknown> },
    input: unknown,
  ) => Promise<unknown>;
}

test("runTool accepts only complete outcomes in every app copy", async () => {
  for (const path of APPS) {
    const runTool = await loadRunTool(path);
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

    assert.equal(await run("complete"), "done", path);
    for (const kind of ["failed", "cancelled", "paused", "review-pending"]) {
      await assert.rejects(run(kind), { message: kind }, `${path}: ${kind}`);
    }
  }
});
