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

/**
 * A store's CRUD tools are registered from the agent's grant, so a `read`
 * grant leaves `store__x__set` unregistered and every tool.json that declares
 * it fails to load with CONFIG_ERROR. The manifests have to agree.
 */
const OPS: Record<string, string[]> = {
  read: ["get", "list", "query"],
  rw: ["get", "list", "query", "set", "remove"],
};

for (const { root, path } of manifests.filter((m) => m.path.endsWith("default/agent.json"))) {
  const tools = `${root}/amodal/tools`;
  if (!existsSync(tools)) continue;

  test(`${root} grants every store tool its tools declare in uses`, () => {
    const grants = Object.fromEntries(storesOf(path));
    for (const tool of readdirSync(tools)) {
      const manifest = `${tools}/${tool}/tool.json`;
      if (!existsSync(manifest)) continue;
      const declared = (JSON.parse(readFileSync(manifest, "utf8")) as {
        uses?: { tools?: string[] };
      }).uses?.tools;

      for (const name of declared ?? []) {
        const store = /^store__(.+)__(get|list|query|set|remove)$/.exec(name);
        if (!store) continue;
        const [, on, op] = store;
        assert.ok(grants[on], `${manifest} uses ${name}, but ${path} grants no ${on} store`);
        assert.ok(
          OPS[grants[on]]?.includes(op),
          `${manifest} uses ${name}, but ${path} grants ${on} "${grants[on]}", which registers ${OPS[grants[on]]?.join(", ")}`,
        );
      }
    }
  });
}
