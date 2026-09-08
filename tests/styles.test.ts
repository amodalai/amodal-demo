import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
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

for (const dir of SRC_DIRS) {
  test(`${dir}/styles.css fits the pipeline table in the desktop content column`, () => {
    const css = readFileSync(`${dir}/styles.css`, "utf8");
    const shell = /\.shell\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    const table = /\.grid--pipeline\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    const maxWidth = Number(/max-width:\s*(\d+)px/.exec(shell)?.[1]);
    const railWidth = Number(/grid-template-columns:\s*(\d+)px/.exec(shell)?.[1]);
    const gap = Number(/gap:\s*(\d+)px/.exec(shell)?.[1]);
    const horizontalPadding = Number(/padding:\s*\d+px\s+(\d+)px/.exec(shell)?.[1]);
    const tableMinWidth = Number(/min-width:\s*(\d+)px/.exec(table)?.[1]);

    assert.ok(
      tableMinWidth <= maxWidth - railWidth - gap - horizontalPadding * 2,
      "the pipeline actions are visible without horizontal scrolling at the desktop max width",
    );
  });
}

for (const dir of SRC_DIRS.filter((dir) => existsSync(`${dir}/components/WeatherAlerts.tsx`))) {
  test(`${dir}/styles.css keeps weather prose compact and long reports scrollable`, () => {
    const dom = new JSDOM('<style></style><div class="detail"><div class="weather__report"><div class="prose"><h2>Active alerts</h2><p>Flood Watch</p><ul><li>Travis County</li></ul></div></div></div>');
    try {
      dom.window.document.querySelector("style")!.textContent = readFileSync(`${dir}/styles.css`, "utf8");
      const report = dom.window.document.querySelector<HTMLElement>(".weather__report")!;
      const style = dom.window.getComputedStyle(report);
      assert.match(style.maxHeight, /rem$/);
      assert.ok(parseFloat(style.maxHeight) > 0 && parseFloat(style.maxHeight) <= 24, "the report fits a compact panel");
      assert.equal(style.overflow, "auto");
      assert.equal(style.overflowWrap, "anywhere");
      const prose = dom.window.getComputedStyle(report.querySelector(".prose")!);
      assert.equal(prose.whiteSpace, "normal");
      assert.equal(prose.padding, "0px");
      assert.ok(parseFloat(dom.window.getComputedStyle(report.querySelector("h2")!).fontSize) <= 16);
      assert.ok(parseFloat(dom.window.getComputedStyle(report.querySelector("ul")!).paddingLeft) > 0);
      report.classList.add("weather__report--expanded");
      assert.equal(dom.window.getComputedStyle(report).maxHeight, "none");
    } finally {
      dom.window.close();
    }
  });
}
