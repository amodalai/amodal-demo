import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { stepsFrom } from "./helpers.js";

const isTest = (file: string) => /\.test\.[cm]?[jt]sx?$/.test(file);

function testFiles(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${prefix}${entry.name}`;
    return entry.isDirectory()
      ? testFiles(`${directory}/${entry.name}`, `${path}/`)
      : isTest(path) ? [path] : [];
  });
}

for (const directory of [".", ...stepsFrom("03-code-vs-llm")]) {
  test(`${directory}: npm test selects every shipped test`, () => {
    const { scripts } = JSON.parse(readFileSync(`${directory}/package.json`, "utf8"));
    assert.ok(scripts.test, "the package needs a test command");
    const selected = spawnSync("sh", ["-c", `set -- ${scripts.test}; printf '%s\\n' "$@"`], {
      cwd: directory,
      encoding: "utf8",
    });
    assert.equal(selected.status, 0, selected.stderr);
    const args = selected.stdout.trim().split("\n");
    assert.ok(args.includes("--test"), "the command must invoke the test runner");
    const shipped = ["amodal", "agents", "hooks", "src", "tests"]
      .filter((path) => existsSync(`${directory}/${path}`))
      .flatMap((path) => testFiles(`${directory}/${path}`, `${path}/`));
    assert.deepEqual(args.slice(args.indexOf("--test") + 1).sort(), shipped.sort());
  });
}
