import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const text = readFileSync(new URL("../lib/map-configuration.ts", import.meta.url), "utf8")
  .replace('import { config } from "@/db";', 'const config = () => ({});');
const compiled = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { mapConfiguration } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

assert.equal(mapConfiguration({}).tileUrl, "https://tile.openstreetmap.org/{z}/{x}/{y}.png");
assert.equal(mapConfiguration({}).styleUrl, "https://tiles.openfreemap.org/styles/positron");
assert.equal(mapConfiguration({}).darkStyleUrl, "https://tiles.openfreemap.org/styles/dark");
const raster = mapConfiguration({ NESHAN_MAP_KEY: "web.old-key", OTP_SECRET: "never-public" });
assert.equal(raster.tileUrl, mapConfiguration({}).tileUrl, "Existing Neshan settings cannot override the raster map");
assert.equal(raster.neshanKey, undefined);
assert.equal(JSON.stringify(raster).includes("never-public"), false);
assert.equal(JSON.stringify(raster).includes("old-key"), false);
assert.throws(() => mapConfiguration({ MAP_TILE_URL: "https://tiles.example.test/{z}/{x}/{y}.png" }));
const custom = mapConfiguration({ MAP_TILE_URL: "https://tiles.example.test/{z}/{x}/{y}.png", MAP_ATTRIBUTION_LABEL: "Provider", MAP_ATTRIBUTION_URL: "https://example.test/copyright" });
assert.equal(custom.attributionLabel, "Provider");
assert.equal(custom.neshanKey, undefined);
assert.equal(custom.styleUrl, undefined, "Explicit raster providers preserve their configuration");
console.log("PASS minimal light/dark styles, custom raster tiles, no Neshan key and server-secret isolation");
