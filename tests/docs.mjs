import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import ts from "typescript";

const specification = JSON.parse(await readFile("docs/openapi.json", "utf8"));
await SwaggerParser.validate(structuredClone(specification), { resolve: { external: false } });

const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const implemented = new Map();
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await inspect(filename);
    else if (entry.name === "route.ts") {
      const source = ts.createSourceFile(filename, await readFile(filename, "utf8"), ts.ScriptTarget.Latest, true);
      const route = "/" + filename.replaceAll(path.sep, "/").replace(/^app\//, "").replace(/\/route\.ts$/, "").replace(/\[([^\]]+)\]/g, "{$1}");
      for (const statement of source.statements) {
        if (!statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
        const names = ts.isVariableStatement(statement)
          ? statement.declarationList.declarations.map(declaration => declaration.name.getText(source))
          : ts.isFunctionDeclaration(statement) ? [statement.name?.text] : [];
        for (const method of names.filter(name => methods.has(name))) implemented.set(`${method} ${route}`, filename.replaceAll(path.sep, "/"));
      }
    }
  }
}
await inspect("app/api");

const documented = new Map();
const operationIds = new Set();
for (const [route, operations] of Object.entries(specification.paths)) {
  for (const [method, operation] of Object.entries(operations)) {
    if (!methods.has(method.toUpperCase())) continue;
    const key = `${method.toUpperCase()} ${route}`;
    documented.set(key, operation["x-source"]);
    assert(!operationIds.has(operation.operationId), `Duplicate operationId: ${key}`);
    operationIds.add(operation.operationId);
    assert.match(operation.summary, /[\u0600-\u06ff]/, `Persian summary missing: ${key}`);
    assert(Array.isArray(operation.security), `Explicit access requirements missing: ${key}`);
    for (const [, name] of route.matchAll(/\{([^}]+)\}/g)) {
      assert(operation.parameters?.some(parameter => parameter.in === "path" && parameter.name === name && parameter.required), `Missing required path parameter ${name}: ${key}`);
    }
  }
}
assert.deepEqual([...documented].sort(), [...implemented].sort(), "OpenAPI must describe every implemented method, with no invented routes");
assert.equal(specification.servers[0].url, "/", "Try it out must use the current deployment");

// Catch broken navigation in the Persian handbook, without contacting external sites.
for (const file of ["README.md", ...(await readdir("docs")).filter(name => name.endsWith(".md")).map(name => `docs/${name}`)]) {
  const content = await readFile(file, "utf8");
  for (const [, target] of content.matchAll(/\]\(([^\s)]+)\)/g)) {
    if (/^(?:[a-z]+:|\/|#)/i.test(target)) continue;
    const local = decodeURIComponent(target.split("#")[0]);
    if (local) await readFile(path.resolve(path.dirname(file), local));
  }
}
console.log(`PASS OpenAPI 3.0.3: ${documented.size} operations match the route handlers; documentation links resolve`);
