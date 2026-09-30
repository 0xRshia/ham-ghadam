import fs from "node:fs";
import ts from "typescript";

const output = ts.transpileModule(fs.readFileSync(new URL("../locales/domain-fa.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
export const localeModuleUrl = `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;

// Unit tests transpile isolated modules without the application's path resolver.
export function withLocaleModules(source) {
  return source.replaceAll('"@/locales/domain-fa"', JSON.stringify(localeModuleUrl));
}
