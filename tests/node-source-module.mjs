import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath, pathToFileURL } from "node:url";

// Load real domain and route modules against the real SQLite adapter without
// starting vinext or substituting database/authentication implementations.
export function nodeSourceModules(directory) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const compiled = new Map();
  function compile(filename) {
    const sourcePath = path.resolve(root, filename);
    if (compiled.has(sourcePath)) return compiled.get(sourcePath);
    const destination = path.join(directory, path.relative(root, sourcePath).replace(/\.ts$/, ".mjs"));
    compiled.set(sourcePath, destination);
    let output = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const ast = ts.createSourceFile(destination, output, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    const replacements = [];
    function visit(node) {
      const specifier = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : null;
      if (specifier && ts.isStringLiteral(specifier) && (specifier.text.startsWith("@/") || specifier.text.startsWith("."))) {
        let target = specifier.text === "@/db" ? path.join(root, "db/node.ts")
          : specifier.text === "@/lib/media-storage" ? path.join(root, "lib/media-storage-node.ts")
          : specifier.text.startsWith("@/") ? path.join(root, specifier.text.slice(2)) : path.resolve(path.dirname(sourcePath), specifier.text);
        if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) target += ".ts";
        replacements.push([specifier.getStart(ast), specifier.end, JSON.stringify(pathToFileURL(compile(target)).href)]);
      } else if (specifier && ts.isStringLiteral(specifier) && specifier.text === "csv-parse/sync") {
        replacements.push([specifier.getStart(ast), specifier.end, JSON.stringify(import.meta.resolve(specifier.text))]);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    for (const [start, end, value] of replacements.sort((a, b) => b[0] - a[0])) output = output.slice(0, start) + value + output.slice(end);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, output);
    return destination;
  }
  return filename => import(pathToFileURL(compile(filename)).href);
}
