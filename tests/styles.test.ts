import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylesheets = [
  "src/styles.css",
  "steps/10-automations/src/styles.css",
  "steps/11-memory-and-surfaces/src/styles.css",
];

for (const stylesheet of stylesheets) {
  test(`${stylesheet} wraps header actions on narrow screens`, async () => {
    const css = await readFile(stylesheet, "utf8");

    assert.match(
      css,
      /@media \(max-width: 760px\)[\s\S]*?\.head__actions\s*{[^}]*\bflex-wrap:\s*wrap;/,
    );
  });
}
