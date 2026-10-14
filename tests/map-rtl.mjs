import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const output = ts.transpileModule(readFileSync("lib/map-rtl.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { ensureMapRtl, MAP_RTL_PLUGIN_URL } = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
let status = "unavailable", finish;
const calls = [];
const sdk = {
  getRTLTextPluginStatus: () => status,
  setRTLTextPlugin: (url, lazy) => {
    calls.push({ url, lazy }); status = "loading";
    return new Promise(resolve => { finish = () => { status = "loaded"; resolve(); }; });
  },
};
const map = ensureMapRtl(sdk), preview = ensureMapRtl(sdk);
assert.equal(map, preview, "Simultaneous maps share initialization instead of registering twice");
assert.deepEqual(calls, [{ url: MAP_RTL_PLUGIN_URL, lazy: false }], "Load RTL before rendering Persian labels, from the app origin");
finish();
await Promise.all([map, preview]);
await ensureMapRtl(sdk);
assert.equal(calls.length, 1, "Route and theme changes cannot register the global plugin again");
assert.ok(readFileSync(`public${MAP_RTL_PLUGIN_URL}`, "utf8").includes("registerRTLTextPlugin"), "The shipped local asset contains the plugin registration");
assert.ok(readFileSync("public/vendor/map-rtl/LICENSE.md", "utf8").includes("Redistribution"));
console.log("PASS shared RTL initialization, eager loading, repeat maps and local asset/license");
