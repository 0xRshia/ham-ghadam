import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const manifestPath = "dist/server/__vite_rsc_assets_manifest.js";
const source = fs.readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(source.replace(/^export default\s+/, "").replace(/;?\s*$/, ""));
const paths = new Set();
for (const entry of [...Object.values(manifest.clientReferenceDeps), ...Object.values(manifest.serverResources)]) {
  for (const url of [...entry.js, ...entry.css]) paths.add(url);
}
for (const url of paths) {
  assert.equal(typeof url, "string", "This deployment uses static asset URLs");
  assert.ok(fs.existsSync(path.join("dist/client", url)), `RSC manifest references a missing asset: ${url}`);
}
console.log(`PASS ${paths.size} RSC stylesheet/module preload URLs resolve to emitted production assets`);
