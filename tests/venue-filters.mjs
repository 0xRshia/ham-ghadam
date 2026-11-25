import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nodeSourceModules } from "./node-source-module.mjs";

const directory = mkdtempSync(join(tmpdir(), "hamghadam-venue-filters-"));
let modules;
try {
  modules = await nodeSourceModules(directory)("lib/venue-filters.ts");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
const { countVenueFilters, filterVenues, INITIAL_VENUE_FILTERS } = modules;

const venues = [
  { id: "unknown", name: "اول", kinds: ["cafe"], lat: 91, lng: 0 },
  { id: "restaurant", name: "رستوران", kinds: ["restaurant"], tags: ["smoke_allowed"], priceLevel: 2, lat: 1, lng: 0 },
  { id: "both", name: "کافه‌سعدی", address: "كوچهٔ ۲", kinds: ["cafe", "restaurant"], tags: ["cozy", "outdoor_space_available"], priceLevel: 1, lat: 0, lng: 0 },
  { id: "cafe", name: "فضای خلوت", kinds: ["cafe"], tags: ["cozy"], priceLevel: 4, lat: 4, lng: 2 },
];
const originalIds = venues.map(venue => venue.id);
const ids = (filters, point) => filterVenues(venues, { ...INITIAL_VENUE_FILTERS, ...filters }, point).map(venue => venue.id);

assert.deepEqual(ids(), originalIds, "Default filters retain venues with missing metadata and preserve input order");
assert.deepEqual(ids({ query: "كافه سعدي" }), ["both"], "Search accepts Arabic letter variants and spacing around Persian half-spaces");
assert.deepEqual(ids({ query: "کوچه 2" }), ["both"], "Address search accepts Persian and Arabic digits and marks");
assert.deepEqual(ids({ kind: "restaurant" }), ["restaurant", "both"], "A café-restaurant appears in either kind");
assert.deepEqual(ids({ amenities: ["cozy", "outdoor_space_available"] }), ["both"], "A venue must have every selected amenity");
assert.deepEqual(ids({ amenities: ["smoke_allowed", "outdoor_space_available"] }), []);
assert.deepEqual(ids({ priceLevel: 2 }), ["restaurant"], "Price filters include only known matching price bands");
assert.deepEqual(ids({ sort: "name" }), ["unknown", "restaurant", "cafe", "both"], "Names sort in Persian alphabetical order");
assert.deepEqual(ids({ sort: "price" }), ["both", "restaurant", "cafe", "unknown"], "Missing prices sort after known bands");
assert.deepEqual(ids({ sort: "distance" }, { lat: 0, lng: 0 }), ["both", "restaurant", "cafe", "unknown"], "Distance accepts zero coordinates and ranks invalid coordinates last");
assert.deepEqual(ids({ sort: "distance" }), originalIds, "Distance mode retains the default order without a reference point");
assert.equal(countVenueFilters({ ...INITIAL_VENUE_FILTERS, query: "الف", sort: "price", priceLevel: 1, amenities: ["cozy", "smoke_allowed"] }), 5);
assert.equal(countVenueFilters(INITIAL_VENUE_FILTERS), 0);
assert.deepEqual(venues.map(venue => venue.id), originalIds, "Filtering and sorting do not mutate the catalog");

console.log("PASS venue filters, Persian search, combined amenity matching, and sorting with incomplete data");
