import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nodeSourceModules } from "./node-source-module.mjs";

const directory = mkdtempSync(join(tmpdir(), "hamghadam-location-catalog-"));
let catalog;
try {
  catalog = await nodeSourceModules(directory)("lib/event-catalog.ts");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
const { filterEvents, groupEvents, defaultCatalogFilters, hasEventCoordinates, withCatalogCity } = catalog;
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

const cityEvents = [
  { ...events[0], id: "tehran", city: "تهران", lat: 35.7, lng: 51.4 },
  { ...events[0], id: "shiraz-soon", city: "شیراز", lat: 29.5, lng: 52.6, starts_at: now + 20000 },
  { ...events[0], id: "shiraz-later", city: "شیراز", lat: 29.7, lng: 52.6, starts_at: now + 30000 },
];
const cityFilters = { ...defaultCatalogFilters, city: "تهران", sort: "distance", point: { lat: 35.7, lng: 51.4, label: "تهران" } };
assert.deepEqual(filterEvents(cityEvents, cityFilters, now).map(event => event.id), ["tehran"]);
assert.deepEqual(filterEvents(cityEvents, { ...cityFilters, city: "شیراز" }, now).map(event => event.id), ["shiraz-later", "shiraz-soon"], "The stale Tehran point would incorrectly control the new city's order");
const changedCity = withCatalogCity(cityFilters, "شیراز");
assert.equal(changedCity.point, null, "A new city must not reopen the old map center");
assert.deepEqual(filterEvents(cityEvents, changedCity, now).map(event => event.id), ["shiraz-soon", "shiraz-later"], "Changing city filters to that city's events and restores date order");
assert.equal(filterEvents(cityEvents, changedCity, now).every(event => event.distance === undefined), true, "The previous center no longer contributes misleading distances");
const allCities = withCatalogCity(cityFilters, "all");
assert.deepEqual(filterEvents(cityEvents, allCities, now).map(event => event.id), ["tehran", "shiraz-soon", "shiraz-later"], "All cities restores the full date-ordered catalog");
assert.equal(allCities.point, null);
assert.equal(withCatalogCity(cityFilters, "تهران"), cityFilters, "Reapplying the same city preserves its selected point and ranking");
const nearby = withCatalogCity(cityFilters, "nearby");
assert.equal(nearby.point, cityFilters.point, "Nearby searches retain the required center");
assert.deepEqual(filterEvents(cityEvents, nearby, now).map(event => event.id), ["tehran"], "Nearby results still use the current point's 50 km radius");
assert.equal(withCatalogCity({ ...cityFilters, sort: "price" }, "شیراز").sort, "price", "Changing city preserves unrelated sorting choices");
assert.equal(cityFilters.point.label, "تهران", "City transitions do not mutate the existing browsing state");
const flexibleEvent = { ...cityEvents[1], id: "shiraz-flexible", starts_at: null, ends_at: null, schedule: {
  kind: "flexible", date_text: "زمان برگزاری اعلام می‌شود", time_text: "", year: 1405,
  dates: [], range_start: null, range_end: null, weekdays: [], excluded_weekdays: [], sessions: [],
} };
assert.deepEqual(filterEvents([...cityEvents, flexibleEvent], changedCity, now).map(event => event.id), ["shiraz-soon", "shiraz-later", "shiraz-flexible"],
  "Changing city retains flexible schedules with unknown dates after dated events");
console.log("PASS point-based ranking, city transitions, preview limits, eligibility, coordinates and new API events");
