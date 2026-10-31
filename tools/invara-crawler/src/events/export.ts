import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Data } from "../model.js";
import { csv, readJson, writeJson } from "../output.js";
import { EVENT_CATEGORY_LABELS, type EventRecord, type EventSource } from "./model.js";

export async function eventFiles(out: string): Promise<EventRecord[]> {
  const folder = path.join(out, "records");
  const files = await readdir(folder).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; });
  const records: EventRecord[] = [];
  for (const file of files.filter(file => file.endsWith(".json")).sort()) {
    const record = await readJson<EventRecord>(path.join(folder, file));
    if (record) records.push(record);
  }
  return records;
}

export async function exportEvents(out: string, events: EventRecord[], reports: unknown = null) {
  await mkdir(out, { recursive: true });
  const sorted = [...events].sort((a, b) => a.event_id.localeCompare(b.event_id));
  const photos = sorted.flatMap(event => event.photos.map((photo, position) => ({ event_id: event.event_id, source: event.source, position, ...photo })));
  const categories = sorted.flatMap(event => event.categories.map(category => ({ event_id: event.event_id, source: event.source, ...category })));
  const rows = sorted.map(event => ({ ...event, price_amount: event.price.amount, price_currency: event.price.currency, price_text: event.price.text,
    is_free: event.price.is_free, photo_urls: event.photos.map(photo => photo.url), category_codes: event.categories.map(category => category.code),
    category_labels: event.categories.map(category => category.label), photo_count: event.photos.length }));
  const taxonomy = Object.entries(EVENT_CATEGORY_LABELS).map(([code, label]) => ({ code, label, count: sorted.filter(event => event.categories.some(category => category.code === code)).length }));
  const overview = { schema_version: 1, exported_at: new Date().toISOString(), event_count: sorted.length,
    sources: Object.fromEntries((["jabama", "davvvat"] as EventSource[]).map(source => [source, sorted.filter(event => event.source === source).length])),
    photo_url_count: photos.length, unique_photo_url_count: new Set(photos.map(photo => photo.url)).size, taxonomy, reports };
  await writeJson(path.join(out, "events.json"), sorted);
  await writeJson(path.join(out, "photos.json"), photos);
  await writeJson(path.join(out, "categories.json"), categories);
  await writeJson(path.join(out, "catalogue.json"), { report: overview, events: sorted });
  await writeJson(path.join(out, "run-report.json"), overview);
  for (const [name, data, columns] of [
    ["events", rows, ["event_id", "source", "source_url", "title", "description", "start_date", "end_date"]],
    ["photos", photos, ["event_id", "source", "url", "role", "raw"]],
    ["categories", categories, ["event_id", "source", "code", "label", "method", "evidence"]],
    ["taxonomy", taxonomy, ["code", "label", "count"]],
  ] as [string, unknown[], string[]][]) await writeFile(path.join(out, `${name}.csv`), csv(data as Data[], columns));
  return overview;
}

export async function combineEvents(out: string) {
  const events: EventRecord[] = [], reports: Data = {};
  for (const source of ["jabama", "davvvat"]) {
    events.push(...await readJson<EventRecord[]>(path.join(out, source, "events.json")) ?? []);
    reports[source] = await readJson(path.join(out, source, "crawl-report.json"));
  }
  return exportEvents(out, events, reports);
}
