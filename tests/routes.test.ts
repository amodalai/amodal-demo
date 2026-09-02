import { test } from "node:test";
import assert from "node:assert/strict";
import { TABS, hashOf, ownsRoute, parseHash, resolveRoute } from "../src/routes.js";

test("each role owns its own tabs and none of the other's", () => {
  for (const role of ["underwriter", "broker"] as const) {
    const other = role === "underwriter" ? "broker" : "underwriter";
    for (const tab of TABS[role]) assert.ok(ownsRoute(role, { name: tab.name }), tab.name);
    for (const tab of TABS[other]) assert.ok(!ownsRoute(role, { name: tab.name }), tab.name);
  }
});

test("both roles reach a submission", () => {
  const route = { name: "submission", submission_id: "sub_a" } as const;
  assert.ok(ownsRoute("underwriter", route));
  assert.ok(ownsRoute("broker", route));
});

test("hashes round-trip, ids included", () => {
  for (const route of [
    { name: "pipeline" } as const,
    { name: "mine" } as const,
    { name: "submission", submission_id: "sub_a/b c" } as const,
  ]) {
    assert.deepEqual(parseHash(hashOf(route)), route, hashOf(route));
  }
});

test("a malformed or unknown hash parses to nothing", () => {
  for (const hash of [
    "",
    "#",
    "#/",
    "#/pipeline/extra",
    "#/submission",
    "#/submission/a/b",
    "#/Pipeline",
    "#/nope",
    "/pipeline",
  ]) {
    assert.equal(parseHash(hash), undefined, hash);
  }
});

test("an unowned or malformed hash redirects to the role's home", () => {
  for (const [role, hash] of [
    ["broker", "#/pipeline"],
    ["broker", "#/guide"],
    ["underwriter", "#/mine"],
    ["underwriter", "#/junk"],
    ["underwriter", ""],
  ] as const) {
    const home = hashOf({ name: TABS[role][0].name });
    assert.deepEqual(resolveRoute(role, hash), { route: { name: TABS[role][0].name }, redirect: home }, hash);
  }
});

test("an owned hash resolves with no redirect", () => {
  assert.deepEqual(resolveRoute("underwriter", "#/history"), { route: { name: "history" } });
  assert.deepEqual(resolveRoute("broker", "#/submission/sub_a"), {
    route: { name: "submission", submission_id: "sub_a" },
  });
});
