import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import ts from "typescript";

/**
 * Load top-level declarations out of a source file by name, without importing
 * the file itself. The UI modules are TSX compiled against DOM types, and the
 * test tsconfig has neither, so the pinned logic is lifted out and transpiled
 * on its own. Candidates are tried in order and the first file declaring every
 * requested name wins, which keeps a pin valid when a function moves between
 * modules.
 */
export async function loadDeclarations<T extends object>(
  names: string[],
  candidates: string[],
): Promise<T> {
  for (const path of candidates) {
    const source = await readFile(path, "utf8").catch(() => undefined);
    if (source === undefined) continue;
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found = new Map<string, string>();
    for (const node of file.statements) {
      const name = declaredName(node);
      // The declaration may already be exported once it lives in its own module.
      if (name && names.includes(name)) {
        found.set(name, node.getText(file).replace(/^export\s+/, ""));
      }
    }
    if (found.size !== names.length) continue;
    const code = ts.transpileModule(
      names.map((n) => `export ${found.get(n)}`).join("\n\n"),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    return (await import(
      `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
    )) as T;
  }
  assert.fail(`no candidate declares all of ${names.join(", ")}: ${candidates.join(", ")}`);
}

function declaredName(node: ts.Statement): string | undefined {
  if (ts.isFunctionDeclaration(node)) return node.name?.text;
  if (ts.isVariableStatement(node)) {
    const [d] = node.declarationList.declarations;
    if (d && ts.isIdentifier(d.name)) return d.name.text;
  }
  return undefined;
}
