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
delete globalThis.document;
console.log("PASS map marker distances, valid zero coordinates, category assets, cluster counts and accessible titles");
