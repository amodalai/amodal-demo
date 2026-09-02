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

/**
 * `table-layout: fixed` divides exactly the widths the stylesheet declares, so
 * a column added without a rule renders at zero width and its contents spill
 * out of the cell. Every table's column count has to match its rules.
 */
const TABLES = [
  { component: "components/SubmissionTable.tsx", modifier: "grid--pipeline" },
  { component: "screens/History.tsx", modifier: "grid--history" },
  { component: "screens/MySubmissions.tsx", modifier: "grid--mine" },
];

for (const dir of SRC_DIRS) {
  for (const { component, modifier } of TABLES) {
    test(`${dir}/${component} sizes every column it renders`, () => {
      const columns = readFileSync(`${dir}/${component}`, "utf8").match(/<th[\s>]/g)?.length ?? 0;
      assert.ok(columns > 0, "the table renders header cells");

      const css = readFileSync(`${dir}/styles.css`, "utf8");
      assert.match(css, new RegExp(`\\.${modifier}\\b`), `${modifier} is styled`);
      const sized = [
        ...css.matchAll(new RegExp(`\\.${modifier} th:nth-child\\((\\d+)\\)`, "g")),
      ].map((m) => Number(m[1]));

      assert.deepEqual(
        sized.sort((a, b) => a - b),
        Array.from({ length: columns }, (_, i) => i + 1),
        `${modifier} sizes columns 1..${columns}`,
      );
    });
  }
}
