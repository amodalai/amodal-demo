import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

type Decision = { action: "allow" } | { action: "block"; reason: string };
interface Hook {
  run(
    point: string,
    payload: { toolName: string; args: Record<string, unknown> },
    ctx: {
      store?: { query(store: string, filter: Record<string, unknown>): Promise<unknown[]> };
      log(message: string): void;
    },
  ): Promise<Decision>;
}

const HOOK_DIR = "hooks/ready-to-quote-guard";
const config = JSON.parse(readFileSync(`${HOOK_DIR}/hook.json`, "utf8")).config as Record<
  string,
  unknown
>;
// The hook ships as .mjs for the runtime's loader, so it is imported by URL
// rather than resolved as a typed module.
const { createHook } = (await import(
  new URL(`../${HOOK_DIR}/index.mjs`, import.meta.url).href
)) as { createHook(config: Record<string, unknown>): Hook };

const docs = (...statuses: Array<[boolean, string]>) =>
  statuses.map(([required, status], i) => ({
    name: `doc ${i}`,
    document_id: `d${i}`,
    required,
    status,
  }));

function guard(documents: unknown[] = []) {
  const logs: string[] = [];
  const queries: Array<[string, Record<string, unknown>]> = [];
  const hook = createHook(config);
  return {
    logs,
    queries,
    run: (payload: { toolName: string; args: Record<string, unknown> }, withStore = true) =>
      hook.run("preToolUse", payload, {
        store: withStore
          ? {
              async query(store, filter) {
                queries.push([store, filter]);
                return documents;
              },
            }
          : undefined,
        log: (m) => logs.push(m),
      }),
  };
}

const write = (value: unknown, toolName = "store__submissions__set") => ({
  toolName,
  args: { key: "sub_a", value },
});

test("blocks a quote decision while a required document is not received", async () => {
  const g = guard(docs([true, "requested"]));
  const out = await g.run(write({ submission_id: "sub_a", decision: "quote" }));
  assert.equal(out.action, "block");
  assert.match((out as { reason: string }).reason, /sub_a cannot be quoted: required document\(s\) not received \(doc 0\)/);
});

test("allows every other decision, and a quote with the packet complete", async () => {
  const g = guard(docs([true, "missing"]));
  for (const decision of ["request-info", "refer", "decline"]) {
    assert.deepEqual(await g.run(write({ submission_id: "sub_a", decision })), { action: "allow" }, decision);
  }
  assert.deepEqual(
    await guard(docs([true, "received"])).run(write({ submission_id: "sub_a", decision: "quote" })),
    { action: "allow" },
  );
});

test("every snapshot ships the same guard", () => {
  const mine = readFileSync(`${HOOK_DIR}/index.mjs`, "utf8");
  const copies = readdirSync("steps")
    .map((step) => `steps/${step}/${HOOK_DIR}/index.mjs`)
    .filter((path) => existsSync(path));
  assert.ok(copies.length >= 6, "the guard exists from step 06 onward");
  for (const path of copies) assert.equal(readFileSync(path, "utf8"), mine, path);
});

test("blocks a ready-to-quote write while a required document is not received", async () => {
  const g = guard(docs([true, "requested"], [false, "missing"]));
  const out = await g.run(
    write({ submission_id: "sub_a", recommendation: "ready-to-quote" }),
  );
  assert.equal(out.action, "block");
  assert.match((out as { reason: string }).reason, /required document\(s\) not received \(doc 0\)/);
  assert.deepEqual(g.queries, [["documents", { submission_id: "sub_a" }]]);
  assert.equal(g.logs.length, 1);
});

test("allows a ready-to-quote write when every required document is received", async () => {
  const g = guard(docs([true, "received"], [false, "missing"]));
  assert.deepEqual(
    await g.run(write({ submission_id: "sub_a", recommendation: "ready-to-quote" })),
    { action: "allow" },
  );
});

test("guards the risk_findings writer on the same rule", async () => {
  const g = guard(docs([true, "missing"]));
  const out = await g.run(
    write({ submission_id: "sub_a", recommendation: "ready-to-quote" }, "store__risk_findings__set"),
  );
  assert.equal(out.action, "block");
});

test("allows any other recommendation, tool, or point", async () => {
  const g = guard(docs([true, "missing"]));
  assert.deepEqual(
    await g.run(write({ submission_id: "sub_a", recommendation: "request-info" })),
    { action: "allow" },
  );
  assert.deepEqual(
    await g.run(write({ submission_id: "sub_a", recommendation: "ready-to-quote" }, "store__claims__set")),
    { action: "allow" },
  );
  assert.deepEqual(await g.run(write("not a row")), { action: "allow" });
  assert.deepEqual(g.queries, [], "an allowed write reads no documents");
  assert.deepEqual(
    await createHook(config).run("postToolUse", write({ recommendation: "ready-to-quote" }), {
      log: () => {},
    }),
    { action: "allow" },
  );
});

test("blocks when the submission cannot be identified or the store is unavailable", async () => {
  assert.equal(
    (await guard().run(write({ recommendation: "ready-to-quote" }))).action,
    "block",
  );
  assert.equal(
    (await guard().run(write({ submission_id: "sub_a", recommendation: "ready-to-quote" }), false))
      .action,
    "block",
  );
});
