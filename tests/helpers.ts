import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const usesTools = (tool: string) =>
  (
    JSON.parse(
      readFileSync(new URL(`../amodal/tools/${tool}/tool.json`, import.meta.url), "utf8"),
    ) as { uses: { tools: string[] } }
  ).uses.tools;

/** Assert every store tool a handler called is declared in its tool.json `uses`; undeclared calls fail closed at runtime. */
export function assertDeclared(tool: string, called: Iterable<string>) {
  const undeclared = [...new Set(called)].filter((n) => !usesTools(tool).includes(n));
  assert.deepEqual(undeclared, [], `${tool} calls tools its uses.tools does not declare`);
}
