import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { STEPS } from "./helpers.js";

/**
 * The runtime validates agent.json when it deploys, not when it builds, so a
 * grant it rejects passes every local check and fails in the cloud.
 */
const GRANTS = ["read", "rw"];

const roots = [".", ...STEPS.map((step) => `steps/${step}`)].filter((root) =>
  existsSync(`${root}/agents`),
);

const manifests = roots.flatMap((root) =>
  readdirSync(`${root}/agents`)
    .map((agent) => `${root}/agents/${agent}/agent.json`)
    .filter(existsSync)
    .map((path) => ({ root, path })),
);

const storesOf = (path: string) =>
  Object.entries(
    (JSON.parse(readFileSync(path, "utf8")) as { stores?: Record<string, string> }).stores ?? {},
  );

test("every agent.json declares a store grant the runtime accepts", () => {
  assert.ok(manifests.length > 0, "found the agent manifests");
  for (const { path } of manifests) {
    for (const [store, grant] of storesOf(path)) {
      assert.ok(
        GRANTS.includes(grant),
        `${path}: ${store} is "${grant}", expected ${GRANTS.join(" or ")}`,
      );
    }
  }
});

test("an agent is granted only stores its own snapshot defines", () => {
  for (const { root, path } of manifests) {
    const defined = new Set(
      readdirSync(`${root}/amodal/stores`).map((file) => file.replace(/\.json$/, "")),
    );
    for (const [store] of storesOf(path)) {
      assert.ok(defined.has(store), `${path} grants ${store}, absent from ${root}/amodal/stores`);
    }
  }
});
