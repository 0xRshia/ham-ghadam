import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function moduleUrl(file, imports = {}) {
  let source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [specifier, url] of Object.entries(imports)) source = source.replaceAll(`"${specifier}"`, `"${url}"`);
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
const types = moduleUrl("lib/types.ts", { "@/locales/domain-fa": moduleUrl("locales/domain-fa.ts") });
const locale = moduleUrl("locales/fa.ts");
const { createMapPoster } = await import(moduleUrl("components/evenline/map-poster-marker.ts", {
  "@/lib/types": types, "@/locales/fa": locale,
}));

// Only DOM construction is needed: no markup parsing or remote media is involved.
class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = { setProperty(name, value) { this[name] = value; } };
  }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes[name] = value; }
}
globalThis.document = { createElement: tagName => new Element(tagName) };
const child = (element, name) => element.children.find(item => item.className === name);
const event = { id: "a", title: "<img src=x onerror=alert(1)>", category: "music", lat: 0, lng: 1 };
const marker = createMapPoster([event], null, { lat: 0, lng: 0 });
assert.equal(child(marker, "el-map-category-distance").textContent, "۱۱۱٫۲ کیلومتر", "The marker uses the real approximate distance from the supplied center");
assert.equal(marker.dataset.eventCount, "1");
assert.equal(marker.attributes["aria-pressed"], "false");
assert.ok(marker.attributes["aria-label"].includes(event.title), "An untrusted event title is kept as accessible text");
assert.ok(marker.attributes["aria-label"].includes("فاصلهٔ تقریبی:"));
assert.equal(marker.children.some(item => item.tagName === "img"), false, "Pins no longer load event posters");
assert.equal(child(marker, "el-map-category-badge").children[0].style.maskImage, 'url("/icons/vuesax/music.svg")');

const selected = { ...event, id: "b", title: "رویداد دوم", category: "halloween", lat: 0, lng: 0 };
const grouped = createMapPoster([event, selected], "b", { lat: 0, lng: 0 });
assert.equal(grouped.attributes["aria-pressed"], "true");
assert.equal(child(grouped, "el-map-category-count").textContent, "۲", "A selected group keeps its full event count");
assert.equal(child(grouped, "el-map-category-distance").textContent, "۰ کیلومتر", "Zero coordinates and zero distance remain valid");
assert.ok(grouped.attributes["aria-label"].startsWith(selected.title));
assert.ok(grouped.attributes["aria-label"].includes(event.title), "Grouped event titles remain accessible");
assert.equal(child(grouped, "el-map-category-badge").children[0].style.maskImage, 'url("/icons/ghost.svg")');

const unavailable = createMapPoster([{ ...event, lat: null }], null, { lat: 0, lng: 0 });
assert.equal(child(unavailable, "el-map-category-distance").textContent, "موسیقی", "Missing coordinates never fabricate a distance");
assert.equal(createMapPoster([event], null).attributes["aria-label"], event.title, "Callers without a point still get an accessible category marker");
const unknown = createMapPoster([{ ...event, category: "unrecognized" }], null, { lat: Number.NaN, lng: 0 });
assert.equal(child(unknown, "el-map-category-distance").textContent, "رویدادها");
assert.equal(child(unknown, "el-map-category-badge").children[0].style.maskImage, 'url("/icons/vuesax/location.svg")');

const cafe = { id: "cafe-a", title: "آرام", kind: "venue", category: "cafe", lat: 0, lng: 0 };
const restaurant = { id: "restaurant-b", title: "آشپزخانه", kind: "venue", category: "restaurant", lat: 0, lng: 1 };
const cafePin = createMapPoster([cafe], null, { lat: 0, lng: 0 });
assert.equal(cafePin.dataset.venueCategory, "cafe");
assert.equal(cafePin.dataset.venueCount, "1");
assert.equal(cafePin.dataset.eventCount, undefined);
assert.ok(cafePin.attributes["aria-label"].includes("آرام؛ کافه"));
assert.equal(child(cafePin, "el-map-category-badge").children[0].style.maskImage, 'url("/icons/vuesax/coffee.svg")');

const venues = createMapPoster([cafe, restaurant], restaurant.id);
assert.equal(venues.dataset.venueCategory, "restaurant");
assert.equal(venues.dataset.venueCount, "2");
assert.equal(venues.attributes["aria-pressed"], "true");
assert.equal(child(venues, "el-map-category-distance").textContent, "رستوران");
assert.equal(child(venues, "el-map-category-count").textContent, "۲");
assert.ok(venues.attributes["aria-label"].includes("آشپزخانه؛ آرام؛ ۲ مکان"));
assert.equal(child(venues, "el-map-category-badge").children[0].style.maskImage, 'url("/icons/restaurant.svg")');
assert.notEqual(venues.style["--el-map-marker-color"], cafePin.style["--el-map-marker-color"]);

const denseVenues = createMapPoster([cafe, restaurant,
  { ...cafe, id: "cafe-b", title: "دنج" }, { ...cafe, id: "cafe-c", title: "کافهٔ چهارم" },
], cafe.id);
assert.ok(denseVenues.attributes["aria-label"].includes("۴ مکان"), "Dense clusters announce their full size");
assert.ok(!denseVenues.attributes["aria-label"].includes("کافهٔ چهارم"), "Venue clusters announce a few examples instead of reading every name");

const mixed = createMapPoster([event, cafe], null);
assert.equal(mixed.dataset.eventCount, "1");
assert.equal(mixed.dataset.venueCount, "1");
assert.ok(mixed.attributes["aria-label"].includes("۱ رویداد؛ ۱ مکان"));
delete globalThis.document;
console.log("PASS map marker distances, valid zero coordinates, event and venue categories, cluster counts and accessible titles");
