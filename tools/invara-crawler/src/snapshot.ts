import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { exportCaptures } from "./cli.js";
import { csv, exportRun, readJson, writeJson } from "./output.js";
import type { Discovery, Failure, Store } from "./model.js";

export async function snapshot(out: string) {
  const state = await readJson<{ started_at: string; discovery: Discovery; failures: Failure[] }>(path.join(out, "checkpoint.json"));
  if (!state) throw new Error("No discovery checkpoint found");
  const stores: Store[] = [];
  for (const file of await readdir(path.join(out, "checkpoints"))) {
    if (!file.endsWith(".json")) continue;
    const store = await readJson<Store>(path.join(out, "checkpoints", file));
    if (store) stores.push(store);
  }
  const byId = new Map(stores.map(store => [store.place_id, store]));
  const ordered = state.discovery.ids.flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
  const rows = state.discovery.ids.map(id => {
    const store = byId.get(id);
    return {
      ...state.discovery.listings[id],
      source_url: new URL(`/places/${encodeURIComponent(id)}`, state.discovery.origin).href,
      enrichment_status: store ? store.reviews_complete && !store.warnings.length ? "complete" : "partial" : "pending",
      address: store?.address ?? null, category_codes: store?.categories ?? null, tags: store?.tags ?? null,
      photo_urls: store?.photos.map(photo => photo.url) ?? null, review_count: store?.reviews.length ?? null,
      detail_file: store ? `checkpoints/${encodeURIComponent(id)}.json` : null,
    };
  });
  await writeJson(path.join(out, "catalog.json"), rows);
  await writeFile(path.join(out, "catalog.csv"), csv(rows, ["place_id", "name", "enrichment_status", "source_url", "address", "latitude", "longitude"]));
  const report = await exportRun(out, state.discovery, ordered, state.failures, state.discovery.ids.length, state.started_at);
  await exportCaptures(out);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { out: { type: "string", default: "exports/all-public" } } });
  const report = await snapshot(path.resolve(values.out!));
  console.log(`Snapshot: ${report.exported_store_count}/${report.requested_store_count} detailed records`);
}
