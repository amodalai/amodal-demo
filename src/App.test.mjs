import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const modules = new Map();
let chat;
let reads;
let pickDesk;
const quiet = () => null;
const overrides = {
  "@amodalai/react": {
    ChatWidget: (props) => {
      chat = props;
      return null;
    },
    useAmodalContext: () => ({
      runtimeUrl: "https://runtime.example",
      client: {},
    }),
    useToolRun: (tool, { scopeId }) => ({
      status: "idle",
      run: async () => {
        reads.push({ tool, scopeId });
        return { outcome: { kind: "complete" } };
      },
      reset: () => {},
    }),
  },
  "./components/Sidebar": {
    Sidebar: ({ children }) => {
      pickDesk = children[0].props.children[1].props.onChange;
      return children;
    },
  },
  "./components/AutoSyncToggle": { AutoSyncToggle: quiet },
  "./components/WeatherAlerts": { WeatherAlerts: quiet },
  "./screens/Guide": { Guide: quiet },
};

// Compile the app with the installed TypeScript compiler, without shipping a test runner or DOM emulator.
function load(path) {
  if (modules.has(path)) return modules.get(path);
  const exports = {};
  modules.set(path, exports);
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  new Function("require", "exports", compiled)((name) => {
    if (name in overrides) return overrides[name];
    if (!name.startsWith(".")) return require(name);
    const local = resolve(dirname(path), name.replace(/\.js$/, ""));
    return load(existsSync(`${local}.tsx`) ? `${local}.tsx` : `${local}.ts`);
  }, exports);
  return exports;
}

const App = load(fileURLToPath(new URL("./App.tsx", import.meta.url))).default;
const originalWindow = globalThis.window;
globalThis.window = { location: { hash: "#/pipeline" } };
after(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

beforeEach(() => {
  reads = [];
  renderToString(createElement(App));
  assert.ok(chat);
});

function toolResult(toolName, status = "success") {
  chat.onToolCall?.({ toolId: toolName, toolName, parameters: {}, status });
}

test("a greeting does not refresh the pipeline", () => {
  chat.onStreamEnd?.();
  assert.deepEqual(reads, []);
});

test("read-only tools and what-if questions do not refresh the pipeline", () => {
  for (const name of [
    "claims_stats",
    "store__submissions__get",
    "store__documents__query",
    "call_subagent",
    "memory",
  ]) {
    toolResult(name);
  }
  chat.onStreamEnd?.();
  assert.deepEqual(reads, []);
});

for (const toolName of ["analyze_submission", "seed_examples"]) {
  test(`${toolName} refreshes the selected desk after the reply`, () => {
    toolResult(toolName);
    assert.deepEqual(reads, []);
    chat.onStreamEnd?.();
    assert.deepEqual(reads, [
      { tool: "list_pipeline", scopeId: "desk-pacific" },
    ]);
  });

  test(`${toolName} refreshes after an error that may follow partial writes`, () => {
    toolResult(toolName, "error");
    chat.onStreamEnd?.();
    assert.equal(reads.length, 1);
  });
}

test("several mutations refresh once and do not affect the next greeting", () => {
  toolResult("seed_examples");
  toolResult("analyze_submission");
  toolResult("claims_stats");
  chat.onStreamEnd?.();
  assert.equal(reads.length, 1);
  chat.onStreamEnd?.();
  assert.equal(reads.length, 1);
});

test("an old chat cannot refresh after switching desks", () => {
  toolResult("analyze_submission");
  pickDesk({ target: { value: "desk-atlantic" } });
  toolResult("seed_examples");
  chat.onStreamEnd?.();
  assert.deepEqual(reads, []);
});
