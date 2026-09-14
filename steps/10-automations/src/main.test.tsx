import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function providerProps(env: { DEV: boolean; VITE_RUNTIME_URL?: string }) {
  const source = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    transformers: { before: [(context) => {
      const visit: ts.Visitor = (node) => ts.isMetaProperty(node)
        ? ts.factory.createIdentifier("meta") : ts.visitEachChild(node, visit, context);
      return (file) => ts.visitNode(file, visit) as ts.SourceFile;
    }] },
  }).outputText;
  let props: { runtimeUrl: string; getToken?: unknown } | undefined;
  const provider = Symbol("AmodalProvider");
  const jsx = (type: unknown, value: { runtimeUrl: string }) => {
    if (type === provider) props = value;
    return null;
  };
  const modules: Record<string, unknown> = {
    react: { StrictMode: Symbol("StrictMode") },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-dom/client": { createRoot: () => ({ render() {} }) },
    "@amodalai/react": { AmodalProvider: provider },
    "@amodalai/react/style.css": {},
    "./styles.css": {},
    "./App.js": { default: () => null },
  };
  new Function("require", "exports", "meta", "window", "document", compiled)(
    (name: string) => { assert.ok(name in modules, name); return modules[name]; },
    {}, { env }, { location: { origin: "https://agent.amodalapp.com" } },
    { getElementById: () => ({}) },
  );
  assert.ok(props);
  return props;
}

for (const value of [undefined, "", "https://another-runtime.example"]) {
  test(`a production build uses its hosted origin with runtime override ${String(value)}`, () => {
    const props = providerProps({ DEV: false, VITE_RUNTIME_URL: value });
    assert.equal(props.runtimeUrl, "https://agent.amodalapp.com");
    assert.equal(new URL("/api/stores", props.runtimeUrl).origin, "https://agent.amodalapp.com");
    assert.equal(props.getToken, undefined);
  });
}

test("development uses an explicit runtime or the local default", () => {
  assert.equal(providerProps({ DEV: true, VITE_RUNTIME_URL: "http://localhost:4011" }).runtimeUrl, "http://localhost:4011");
  for (const value of [undefined, ""]) {
    assert.equal(providerProps({ DEV: true, VITE_RUNTIME_URL: value }).runtimeUrl, "http://localhost:3001");
  }
});
