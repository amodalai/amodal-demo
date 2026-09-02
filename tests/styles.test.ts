import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { SRC_DIRS } from "./helpers.js";

/**
 * The layout has to survive a narrow viewport. The rail carries the brand, the
 * role switcher, the tabs and the desk controls, so it is the element that has
 * to reflow; the detail grid and the document rows collapse with it.
 */
for (const dir of SRC_DIRS) {
  const stylesheet = `${dir}/styles.css`;
  if (!existsSync(stylesheet)) continue;
  test(`${stylesheet} reflows the rail on narrow screens`, () => {
    const css = readFileSync(stylesheet, "utf8");
    const narrow = /@media \(max-width: 760px\) \{([\s\S]*)$/.exec(css)?.[1];
    assert.ok(narrow, "the 760px breakpoint exists");
    assert.match(narrow, /\.shell\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/);
    assert.match(narrow, /\.rail\s*\{[^}]*flex-wrap:\s*wrap;/);
    assert.match(narrow, /\.rail__tabs\s*\{[^}]*flex-wrap:\s*wrap;/);
  });
}
