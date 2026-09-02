import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { SRC_DIRS } from "./helpers.js";

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
