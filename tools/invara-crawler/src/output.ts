import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { codes } from "./model.js";
import type { Data, Discovery, Failure, Store } from "./model.js";
import { mergeTaxonomy } from "./normalize.js";

export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

export async function readJson<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await readFile(file, "utf8")) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function csv(rows: Data[], requiredColumns: string[] = []): string {
  const columns = [...new Set([...requiredColumns, ...rows.flatMap(row => Object.keys(row))])];
  const cell = (value: unknown): string => {
    let string = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    // Keep arbitrary public text from becoming a formula when a CSV is opened in Excel.
    if (typeof value === "string" && /^[\s\uFEFF]*[=+@-]/u.test(string)) string = `'${string}`;
    return `"${string.replaceAll('"', '""')}"`;
  };
  return `\uFEFF${[columns.map(cell).join(","), ...rows.map(row => columns.map(column => cell(row[column])).join(","))].join("\r\n")}\r\n`;
}

export function storeCsvRow(store: Store): Data {
  const { photos, reviews, ...fields } = store;
  return {
    ...fields,
    venue_photo_url_count: photos.filter(photo => photo.kind === "venue").length,
    review_photo_url_count: photos.filter(photo => photo.kind === "review").length,
    review_count: reviews.length,
    venue_photo_urls: photos.filter(photo => photo.kind === "venue").map(photo => photo.url),
    review_photo_urls: photos.filter(photo => photo.kind === "review").map(photo => photo.url),
  };
}

export async function exportRun(out: string, discovery: Discovery, stores: Store[], failures: Failure[], requestedLimit: number, startedAt: string) {
  const taxonomy = mergeTaxonomy(discovery.taxonomy, stores);
  const photos = stores.flatMap(store => store.photos);
  const reviews = stores.flatMap(store => store.reviews);
  const classificationRows: Data[] = [];
  for (const store of stores) {
    for (const code of store.categories) classificationRows.push({ place_id: store.place_id, kind: "category", code, label_fa: null, review_id: null, source: "place" });
    for (const tag of store.tags) classificationRows.push({ place_id: store.place_id, kind: "tag", code: tag.code, label_fa: tag.label_fa, review_id: null, source: "place" });
    for (const review of store.reviews) for (const code of codes(review.dish_tags)) classificationRows.push({
      place_id: store.place_id, kind: "food", code,
      label_fa: taxonomy.find(item => item.kind === "food" && item.code === code)?.label_fa ?? null,
      review_id: review.id, source: "review",
    });
  }
  const coverageFields = ["address", "latitude", "longitude", "categories", "tags", "price_level", "cover_image_url", "menu_url", "nearest_metro", "photos"] as const;
  const coverage = Object.fromEntries(coverageFields.map(field => [field, stores.filter(store => {
    const value = store[field];
    return Array.isArray(value) ? value.length > 0 : value !== null && value !== "";
  }).length]));
  const report = {
    schema_version: 1, origin: discovery.origin, seed_url: discovery.seed_url,
    started_at: startedAt, exported_at: new Date().toISOString(),
    requested_store_count: requestedLimit, discovered_store_count: discovery.ids.length,
    exported_store_count: stores.length, failed_store_count: requestedLimit - stores.length,
    unique_store_count: new Set(stores.map(store => store.place_id)).size,
    selection: "First venues in the site's default discovery order; this is not a random sample or a complete site crawl.",
    geographic_scope: discovery.pages.map(page => {
      const url = new URL(page.url);
      return { lat: url.searchParams.get("lat"), lng: url.searchParams.get("lng"), radius: url.searchParams.get("radius"), sort: url.searchParams.get("sort") };
    }).filter((value, index, values) => index === values.findIndex(other => JSON.stringify(value) === JSON.stringify(other))),
    collection_method: "Public browser pages and the public place data returned during those visits. No direct API enumeration, sign-in, private saved lists, profile crawl, or external menu crawl.",
    robots_txt: discovery.robots_txt,
    photo_url_count: photos.length, unique_photo_url_count: new Set(photos.map(photo => photo.url)).size,
    venue_photo_url_count: photos.filter(photo => photo.kind === "venue").length,
    review_photo_url_count: photos.filter(photo => photo.kind === "review").length,
    review_count: reviews.length, classification_count: classificationRows.length,
    taxonomy_count: taxonomy.length,
    reviews_complete_store_count: stores.filter(store => store.reviews_complete).length,
    partial_store_ids: stores.filter(store => !store.reviews_complete || store.warnings.length).map(store => store.place_id),
    missing_store_ids: discovery.ids.slice(0, requestedLimit).filter(id => !stores.some(store => store.place_id === id)),
    field_coverage_store_counts: coverage, failures,
    notes: [
      "Photo files are not saved in the export. Original and thumbnail URLs are preserved as separate variants when supplied.",
      "Food associations from reviews retain the review ID and are not asserted to be an official venue menu.",
      "Null/absent fields were not supplied in the public response; unknown source fields remain in raw_place/raw_listing and review objects.",
      "CSV uses UTF-8 with BOM and CRLF. Nested values are JSON strings; strings that could execute spreadsheet formulas have an apostrophe prefix. JSON retains the exact source text.",
      "Scope and completeness refer only to this pilot's selected venues and captured public pages.",
    ],
  };
  await writeJson(path.join(out, "invara.json"), { report, taxonomy, stores });
  await writeJson(path.join(out, "stores.json"), stores);
  await writeJson(path.join(out, "taxonomy.json"), taxonomy);
  await writeJson(path.join(out, "photos.json"), photos);
  await writeJson(path.join(out, "reviews.json"), reviews);
  await writeJson(path.join(out, "classifications.json"), classificationRows);
  await writeJson(path.join(out, "run-report.json"), report);
  await writeJson(path.join(out, "errors.json"), failures);
  for (const [name, rows, columns] of [
    ["stores", stores.map(storeCsvRow), ["place_id", "name", "source_url"]],
    ["photos", photos as unknown as Data[], ["place_id", "review_id", "kind", "role", "position", "url", "raw"]],
    ["reviews", reviews, ["place_id", "id", "body", "reaction"]],
    ["classifications", classificationRows, ["place_id", "kind", "code", "label_fa", "review_id", "source"]],
    ["taxonomy", taxonomy as unknown as Data[], ["kind", "code", "label_fa", "filterable", "source"]],
    ["errors", failures as unknown as Data[], ["place_id", "phase", "message", "occurred_at"]],
    ["run-report", [report], ["requested_store_count", "exported_store_count"]],
  ] as [string, Data[], string[]][]) await writeFile(path.join(out, `${name}.csv`), csv(rows, columns));
  return report;
}
