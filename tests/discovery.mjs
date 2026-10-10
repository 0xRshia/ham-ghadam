import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { withLocaleModules } from "./locale-module.mjs";

function moduleUrl(file, replacements = []) {
  let source = withLocaleModules(fs.readFileSync(file, "utf8"));
  for (const [from, to] of replacements) source = source.replaceAll(from, JSON.stringify(to));
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
}
const types = moduleUrl("lib/types.ts");
const recommendations = moduleUrl("lib/recommendations.ts");
const { defaultCatalogFilters, filterEvents, homeEventSections } = await import(moduleUrl("lib/event-catalog.ts", [
  ['"./types"', types], ['"./recommendations"', recommendations],
]));
const now = Date.UTC(2026, 9, 8), day = 86400000;
const point = { lat: 35.6892, lng: 51.389, label: "Selected point" };
const event = (id, changes = {}) => ({
  id, host_id: "test-host", title: "هنر", description: "", category: "art", venue: "هنر", address: "",
  city: "تهران", lat: point.lat, lng: point.lng, maps_url: null, starts_at: now + day,
  ends_at: now + day + 3600000, registration_ends_at: now + day, price: 100, minimum_price: 100,
  capacity: 10, remaining: 10, attendees: 0, image: null, thumbnail: null,
  published: 1, sample: 0, created_at: now, ...changes,
});
const fixtures = [
  event("far", { lat: 32.65, lng: 51.67, city: "اصفهان", attendees: 50 }),
  event("unknown", { lat: null, lng: null, starts_at: now + 1000 }),
  event("later", { starts_at: now + 3 * day }),
  event("b", { starts_at: now + 2 * day }),
  event("a", { starts_at: now + 2 * day, price: 0, minimum_price: 0 }),
  event("expired", { starts_at: now - 1000 }),
];
const nearestFilters = { ...defaultCatalogFilters, point, sort: "distance" };
const nearest = filterEvents(fixtures, nearestFilters, now);
assert.deepEqual(nearest.map(item => item.id), ["a", "b", "later", "far", "unknown"]);
assert.ok(nearest.find(item => item.id === "far").distance > 50, "Distant cities remain in the catalog");
assert.equal(nearest.at(-1).distance, undefined, "Unknown locations are not assigned invented distances");
const ordinary = filterEvents(fixtures, defaultCatalogFilters, now);
assert.deepEqual(ordinary.map(item => item.id), ["unknown", "far", "a", "b", "later"]);
assert.ok(ordinary.every(item => item.distance === undefined));
assert.deepEqual(filterEvents(fixtures, { ...nearestFilters, free: true, category: "art", query: "هنر", when: "week" }, now).map(item => item.id), ["a"]);
assert.deepEqual(filterEvents(fixtures, { ...nearestFilters, city: "اصفهان" }, now).map(item => item.id), ["far"]);
assert.deepEqual(filterEvents(fixtures, { ...nearestFilters, query: "no match" }, now), []);
assert.equal(filterEvents([event("invalid", { lat: NaN })], nearestFilters, now)[0].distance, undefined);

const candidates = [
  ...Array.from({ length: 10 }, (_, i) => event(`remote-${i}`, { lat: 36 + i / 10, attendees: 100 - i })),
  event("closest", { starts_at: now + 4 * day }),
  event("closed", { registration_ends_at: now }),
  event("sold-out", { remaining: 0 }),
  event("not-recommended"),
];
const suggestions = candidates.filter(item => item.id !== "not-recommended").map(item => ({ eventId: item.id, reason: "popular" }));
const sections = homeEventSections(filterEvents(candidates, nearestFilters, now), suggestions, now, true);
assert.equal(sections.upcoming[0].id, "closed");
assert.equal(sections.popular[0].id, "closed");
assert.equal(sections.suggested[0].event.id, "closest", "Distance ordering precedes the eight-suggestion limit");
assert.equal(sections.suggested.length, 8);
assert.ok(sections.suggested.every(({ event }) => !["closed", "sold-out", "not-recommended"].includes(event.id)));
const normalSections = homeEventSections(filterEvents(candidates, defaultCatalogFilters, now), suggestions, now, false);
assert.equal(normalSections.popular[0].id, "remote-0");
assert.equal(normalSections.suggested[0].event.id, "remote-0");
assert.notEqual(normalSections.upcoming[0].id, "closest");
assert.deepEqual(homeEventSections([], [], now, true), { upcoming: [], popular: [], suggested: [] });

const weekBoundary = [
  event("past", { starts_at: now - 1 }),
  event("starting", { starts_at: now }),
  event("soon", { starts_at: now + 1, distance: 10 }),
  event("within-week", { starts_at: now + 7 * day - 1, distance: 1 }),
  event("exact-week", { starts_at: now + 7 * day }),
  event("after-week", { starts_at: now + 7 * day + 1 }),
];
assert.deepEqual(homeEventSections(weekBoundary, [], now, false).upcoming.map(item => item.id), ["soon", "within-week"]);
assert.deepEqual(homeEventSections(weekBoundary, [], now, true).upcoming.map(item => item.id), ["within-week", "soon"]);
assert.deepEqual(homeEventSections(weekBoundary, [], now + 2, false).upcoming.map(item => item.id),
  ["within-week", "exact-week", "after-week"], "Started events leave and loaded events enter the rolling week");
const laterOnly = homeEventSections([event("later-only", { starts_at: now + 8 * day })], [], now, false);
assert.equal(laterOnly.upcoming.length, 0);
assert.equal(laterOnly.popular[0].id, "later-only", "The week boundary applies only to upcoming events");
assert.equal(normalSections.upcoming.length, candidates.length, "Upcoming events are not capped at eight");
console.log("PASS rolling seven-day window, distance ordering, ties, missing coordinates, combined filters, section limits and recommendation eligibility");
