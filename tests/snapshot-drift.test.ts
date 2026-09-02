import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { SRC_DIRS, STEPS, stepsFrom } from "./helpers.js";

/**
 * Eight copies of the same app is what a tutorial made of snapshots costs. The
 * modules below carry no per-step difference, so a fix applied to one and not
 * the rest is always a mistake. Only App.tsx varies by design: it wires the
 * data source, the desks, and the surfaces that step has.
 */
const SHARED = [
  "actions.tsx",
  "analyze.ts",
  "main.tsx",
  "persona.ts",
  "routes.ts",
  "serial.ts",
  "styles.css",
  "tools.ts",
  "types.ts",
  "components/DecideModal.tsx",
  "components/DocumentsEditor.tsx",
  "components/FindingBody.tsx",
  "components/Modal.tsx",
  "components/Pills.tsx",
  "components/Sidebar.tsx",
  "components/SubmissionActions.tsx",
  "components/SubmissionTable.tsx",
  "components/Timeline.tsx",
  "screens/Guide.tsx",
  "screens/History.tsx",
  "screens/MySubmissions.tsx",
  "screens/NewSubmission.tsx",
  "screens/Pipeline.tsx",
  "screens/SubmissionDetail.tsx",
  // Present only from the step that introduces the Gmail connection.
  "reply.ts",
  "components/ReplyModal.tsx",
];

test("every snapshot ships a UI", () => {
  const withSrc = readdirSync("steps").filter((s) => existsSync(`steps/${s}/src/App.tsx`));
  assert.deepEqual(
    SRC_DIRS,
    ["src", ...withSrc.map((s) => `steps/${s}/src`)],
    "SRC_DIRS lists exactly the snapshots that have one",
  );
});

for (const file of SHARED) {
  test(`${file} is identical in every snapshot that has it`, () => {
    const dirs = SRC_DIRS.filter((dir) => existsSync(`${dir}/${file}`));
    assert.ok(dirs.includes("src"), `the root declares ${file}`);
    const mine = readFileSync(`src/${file}`, "utf8");
    for (const dir of dirs) assert.equal(readFileSync(`${dir}/${file}`, "utf8"), mine, dir);
  });
}

test("App.tsx differs per snapshot, so the shared list is doing work", () => {
  const apps = new Set(SRC_DIRS.map((dir) => readFileSync(`${dir}/App.tsx`, "utf8")));
  assert.equal(apps.size, 4, "one root app plus the three step variants");
});

/**
 * `amodal/_lib` is copied into every step that has reached it, and the early
 * copies are deliberately behind: each module names the step from which it stops
 * changing, so a refinement landed on the root alone fails instead of shipping
 * stale copies.
 */
const LIB_STABLE_FROM = {
  "decision.ts": "05-custom-ui",
  "events.ts": "05-custom-ui",
  "reset.ts": "05-custom-ui",
  "underwriting-analysis.ts": "05-custom-ui",
  "demo-data.ts": "07-gmail-connection",
  "submit.ts": "07-gmail-connection",
  "examples.ts": "08-custom-tool",
};

test("every amodal/_lib module is pinned", () => {
  assert.deepEqual(readdirSync("amodal/_lib").sort(), Object.keys(LIB_STABLE_FROM).sort());
});

for (const [file, from] of Object.entries(LIB_STABLE_FROM)) {
  test(`amodal/_lib/${file} is identical from step ${from} on`, () => {
    const mine = readFileSync(`amodal/_lib/${file}`, "utf8");
    for (const dir of stepsFrom(from)) {
      const path = `${dir}/amodal/_lib/${file}`;
      assert.ok(existsSync(path), `${path} exists`);
      assert.equal(readFileSync(path, "utf8"), mine, path);
    }
  });
}

test("the _lib start steps are doing work", () => {
  for (const [file, from] of Object.entries(LIB_STABLE_FROM)) {
    const before = `steps/${STEPS[STEPS.indexOf(from) - 1]}/amodal/_lib/${file}`;
    if (!existsSync(before)) continue;
    assert.notEqual(readFileSync(before, "utf8"), readFileSync(`amodal/_lib/${file}`, "utf8"), before);
  }
});
