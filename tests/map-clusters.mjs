import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = ts.transpileModule(readFileSync("lib/map-clusters.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { clusterMapEvents } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const events = [
  { id: "a", lat: 35, lng: 51, x: 47, y: 20 },
  { id: "b", lat: 35.01, lng: 51.01, x: 49, y: 20 },
  { id: "c", lat: 36, lng: 52, x: 200, y: 200 },
];
const groups = clusterMapEvents(events, event => event);
assert.deepEqual(groups.map(group => group.items.map(event => event.id)), [["a", "b"], ["c"]], "Close pins merge across screen-grid boundaries, distant pins stay separate");
assert.ok(Math.abs(groups[0].lat - 35.005) < 1e-8, "The group stays centered on its event coordinates");
assert.deepEqual(clusterMapEvents(events, event => ({ x: event.x * 100, y: event.y * 100 })).map(group => group.items.length), [1, 1, 1], "Zooming separates previously overlapping markers");
const coincident = Array.from({ length: 30 }, (_, id) => ({ id, lat: 0, lng: 0 }));
assert.equal(clusterMapEvents(coincident, () => ({ x: 0, y: 0 }))[0].items.length, 30, "Identical API coordinates remain a counted group");
assert.equal(clusterMapEvents([...coincident, { id: 30, lat: 0, lng: 0 }], () => ({ x: 0, y: 0 }))[0].items.length, 31, "New API events are included in cluster counts");
assert.deepEqual(clusterMapEvents([], () => ({ x: 0, y: 0 })), []);
assert.equal(events[0].lat, 35, "Clustering does not alter backend coordinates");
console.log("PASS nearby pins, grid edges, zoom, coincident coordinates and API additions");
