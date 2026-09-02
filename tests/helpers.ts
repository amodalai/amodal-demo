import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const usesTools = (tool: string) =>
  (
    JSON.parse(
      readFileSync(new URL(`../amodal/tools/${tool}/tool.json`, import.meta.url), "utf8"),
    ) as { uses: { tools: string[] } }
  ).uses.tools;

/** Every snapshot that ships a UI, plus the repo root, as `src` directory paths from the repo root. */
export const SRC_DIRS = [
  "src",
  ...[
    "05-custom-ui",
    "06-guardrail-hooks",
    "07-gmail-connection",
    "08-custom-tool",
    "09-model-delegation",
    "10-automations",
    "11-memory-and-surfaces",
  ].map((step) => `steps/${step}/src`),
];

/** Assert every store tool a handler called is declared in its tool.json `uses`; undeclared calls fail closed at runtime. */
export function assertDeclared(tool: string, called: Iterable<string>) {
  const undeclared = [...new Set(called)].filter((n) => !usesTools(tool).includes(n));
  assert.deepEqual(undeclared, [], `${tool} calls tools its uses.tools does not declare`);
}
