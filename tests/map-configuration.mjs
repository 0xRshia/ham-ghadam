import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const text = readFileSync(new URL("../lib/map-configuration.ts", import.meta.url), "utf8")
  .replace('import { config } from "@/db";', 'const config = () => ({});');
const compiled = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { mapConfiguration } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

assert.equal(mapConfiguration({}).tileUrl, "https://tile.openstreetmap.org/{z}/{x}/{y}.png");
const neshan = mapConfiguration({ NESHAN_MAP_KEY: " web.test-only-key ", OTP_SECRET: "never-public", MAP_TILE_URL: "invalid-legacy-value" });
assert.equal(neshan.neshanKey, "web.test-only-key");
assert.equal(neshan.tileUrl, "", "Neshan takes precedence over the legacy tile layer");
assert.equal(JSON.stringify(neshan).includes("never-public"), false);
assert.throws(() => mapConfiguration({ NESHAN_MAP_KEY: "service.secret" }), /Invalid Neshan/);
assert.throws(() => mapConfiguration({ MAP_TILE_URL: "https://tiles.example.test/{z}/{x}/{y}.png" }));
const custom = mapConfiguration({ MAP_TILE_URL: "https://tiles.example.test/{z}/{x}/{y}.png", MAP_ATTRIBUTION_LABEL: "Provider", MAP_ATTRIBUTION_URL: "https://example.test/copyright" });
assert.equal(custom.attributionLabel, "Provider");
assert.equal(custom.neshanKey, undefined);
console.log("PASS Neshan key validation, provider selection, legacy configuration and server-secret isolation");
