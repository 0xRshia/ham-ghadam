import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { withLocaleModules } from "./locale-module.mjs";

function moduleUrl(file, imports = {}) {
  let source = withLocaleModules(readFileSync(file, "utf8"));
  for (const [specifier, url] of Object.entries(imports)) source = source.replaceAll(JSON.stringify(specifier), JSON.stringify(url));
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
}
const { filterEvents, groupEvents, defaultCatalogFilters, hasEventCoordinates } = await import(moduleUrl("lib/event-catalog.ts", {
  "./types": moduleUrl("lib/types.ts"),
  "./recommendations": moduleUrl("lib/recommendations.ts"),
  "./product-mode": moduleUrl("lib/product-mode.ts"),
}));
const now = 1_800_000_000_000;
const events = Array.from({ length: 12 }, (_, index) => ({
  id: `event-${index}`, title: `Event ${index}`, venue: "", address: "", city: "تهران", category: "games",
  lat: 35 + index / 10, lng: 51, starts_at: now + 10000 + index * 1000,
  registration_ends_at: now + 5000, remaining: null, price: 0, created_at: now,
}));
const suggestions = events.map(event => ({ eventId: event.id, reason: "popular" }));
const filters = { ...defaultCatalogFilters, sort: "distance", point: { lat: 36.1, lng: 51, label: "Selected" } };
const filtered = filterEvents(events, filters, now);
assert.equal(filtered[0].id, "event-11", "The chosen point outranks date order");
assert.equal(filtered.length, 12, "Distant events remain available when selecting a point");
const grouped = groupEvents(filtered, suggestions, now, "distance");
assert.deepEqual(grouped.suggested.map(item => item.event.id), filtered.slice(0, 8).map(event => event.id), "Rank ALL suggestions by distance before limiting to eight");
assert.equal(groupEvents(filtered, suggestions, now).suggested[0].event.id, "event-0", "Without distance mode, preserve the server recommendation order");
assert.equal(suggestions[0].eventId, "event-0", "Do not mutate the API payload");
const closed = events.map(event => event.id === "event-11" ? { ...event, remaining: 0 } : event);
assert.equal(groupEvents(filterEvents(closed, filters, now), suggestions, now, "distance").suggested[0].event.id, "event-10", "Sold-out events stay out of recommendations");
for (const point of [{ lat: null, lng: 51 }, { lat: NaN, lng: 51 }, { lat: 91, lng: 51 }, { lat: 35, lng: 181 }]) assert.equal(hasEventCoordinates(point), false);
assert.equal(hasEventCoordinates({ lat: 0, lng: 0 }), true, "Zero coordinates are valid");
const missing = { ...events[0], id: "missing", lat: null };
assert.equal(filterEvents([missing, ...events], filters, now).at(-1).id, "missing", "Unknown locations sort after known distances");
const newEvent = { ...events[0], id: "new-api-event", lat: 36.1, lng: 51 };
assert.equal(filterEvents([...events, newEvent], filters, now)[0].id, newEvent.id, "New API coordinates participate without a manual marker list");
console.log("PASS point-based ranking, preview limits, eligibility, coordinates and new API events");
