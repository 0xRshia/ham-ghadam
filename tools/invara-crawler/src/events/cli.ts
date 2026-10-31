import { createHash } from "node:crypto";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { Data } from "../model.js";
import { readJson, writeJson } from "../output.js";
import { parseEvent } from "./adapters.js";
import { discoverEvents } from "./discovery.js";
import { combineEvents, eventFiles, exportEvents } from "./export.js";
import { BlockedPageError, PublicHtmlClient } from "./http.js";
import { type EventInventory, type EventSource } from "./model.js";

interface Progress { status: "saved" | "excluded" | "failed"; event_id?: string; reason?: string; at: string }
interface Checkpoint { source: EventSource; city?: string; started_at: string; updated_at: string; pages: Record<string, Progress> }
export interface CrawlOptions { out: string; source: EventSource; delayMs: number; limit: number; refresh: boolean; offline: boolean; city: string }

async function lock(out: string) {
  const file = path.join(out, ".crawl.lock");
  await mkdir(out, { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const handle = await open(file, "wx");
      await handle.writeFile(JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }));
      return async () => { await handle.close(); await rm(file, { force: true }); };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const oldText = await readFile(file, "utf8"), old = JSON.parse(oldText) as { pid: number };
      if (!Number.isSafeInteger(old.pid) || old.pid < 1) throw new Error("Invalid crawler lock; inspect .crawl.lock");
      try { process.kill(old.pid, 0); throw new Error(`An event crawler is already running (PID ${old.pid}).`); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
      if (await readFile(file, "utf8") === oldText) await rm(file);
    }
  }
  throw new Error("Could not acquire event crawler lock");
}

export async function crawlSource(options: CrawlOptions, onExport: () => Promise<unknown> = async () => {}) {
  const { out, source, delayMs, limit, refresh, offline, city } = options;
  const folder = path.join(out, source), checkpointFile = path.join(folder, "checkpoint.json");
  const client = new PublicHtmlClient(source, path.join(folder, "pages"), delayMs, offline);
  const checkpoint = await readJson<Checkpoint>(checkpointFile) ?? { source, started_at: new Date().toISOString(), updated_at: new Date().toISOString(), pages: {} };
  if (source === "jabama" && checkpoint.city !== city) {
    // A previous city's exclusions must not hide details when the scope expands.
    for (const [url, page] of Object.entries(checkpoint.pages)) if (page.status === "excluded") delete checkpoint.pages[url];
  }
  checkpoint.city = city;
  let inventory = !refresh ? await readJson<EventInventory>(path.join(folder, "inventory.json")) : null;
  if (!inventory) {
    inventory = await discoverEvents(source, client, refresh);
    await writeJson(path.join(folder, "inventory.json"), inventory);
  } else client.setRobots(inventory.robots_txt);
  const records = new Map((await eventFiles(folder)).map(event => [event.event_id, event]));
  let interrupted: string | null = null, visitedThisRun = 0;
  const emit = async (state: string) => {
    const targets = inventory!.urls;
    const included = [...records.values()].filter(event => targets.includes(event.source_url) && (source !== "jabama" || city === "all" || event.city_code === city));
    const missing = targets.filter(url => !["saved", "excluded"].includes(checkpoint.pages[url]?.status ?? ""));
    const excluded = targets.filter(url => checkpoint.pages[url]?.status === "excluded").map(url => ({ url, ...checkpoint.pages[url] }));
    const complete = inventory!.complete && !missing.length && !interrupted;
    const report = { source, state: complete ? "complete" : state, scope: source === "jabama" ? { city, seed: inventory!.seed_url } : { city: "all", seed: inventory!.seed_url },
      started_at: checkpoint.started_at, updated_at: new Date().toISOString(), complete, inventory_complete: inventory!.complete,
      target_public_url_count: targets.length, exported_event_count: included.length, excluded_count: excluded.length,
      fetched_detail_count: targets.filter(url => ["saved", "excluded"].includes(checkpoint.pages[url]?.status ?? "")).length,
      missing_url_count: missing.length, missing_urls: missing, excluded,
      failures: Object.entries(checkpoint.pages).filter(([url, progress]) => targets.includes(url) && progress.status === "failed").map(([url, progress]) => ({ url, ...progress })),
      review_pagination_event_ids: included.filter(event => event.raw_page.route_data && (event.raw_page.route_data as Data).reviewFeed
        && ((event.raw_page.route_data as Data).reviewFeed as Data).nextCursor).map(event => event.event_id),
      stopped_reason: interrupted, inventory_audits: inventory!.audits,
      collection_method: "Public sitemap/listing URLs and server-rendered event pages. No API requests, sign-in, checkout, profile crawling or image downloads.",
      notes: ["Shared categories include source mappings and title rules; method and evidence are exported. Source categories remain unchanged.",
        "Jabama sitemap covers several cities; all detail candidates are city-checked before inclusion. Linked public theater pages are included.",
        "Davvvat calendar dates and clock fields stay separate; no guessed instants. Amounts/currencies are never silently converted.",
        "Unknown public event fields remain in raw_event; original HTML and fetch metadata are retained in pages/.",
        "Complete refers to event detail pages. Reviews are those embedded in each page; any theater review pagination cursor is retained and reported, without following separate review endpoints.",
        "Coverage refers to the recorded public sitemap and listing inventory, not private/unlisted events or an independently verified backend database."],
    };
    checkpoint.updated_at = report.updated_at;
    await writeJson(checkpointFile, checkpoint);
    await writeJson(path.join(folder, "crawl-report.json"), report);
    await exportEvents(folder, included, report);
    await onExport();
    return report;
  };
  await emit("running");
  for (const url of inventory.urls) {
    const previous = checkpoint.pages[url];
    const previousRecord = records.get(previous?.event_id ?? "");
    const fitsScope = source !== "jabama" || city === "all" || previousRecord?.city_code === city;
    if (!refresh && (previous?.status === "excluded" || (previous?.status === "saved" && previousRecord && fitsScope))) continue;
    if (limit && visitedThisRun >= limit) break;
    visitedThisRun++;
    try {
      const capture = await client.get(url, refresh);
      const event = parseEvent(source, capture.text, url, capture.fetched_at);
      if (source === "jabama" && city !== "all" && event.city_code !== city) {
        if (!event.city_code) throw new Error("Event has no city code; cannot verify requested city scope");
        checkpoint.pages[url] = { status: "excluded", reason: `Outside ${city}: ${event.city_code}`, at: new Date().toISOString() };
      } else {
        records.set(event.event_id, event);
        const file = createHash("sha256").update(event.event_id).digest("hex");
        await writeJson(path.join(folder, "records", `${file}.json`), event);
        checkpoint.pages[url] = { status: "saved", event_id: event.event_id, at: new Date().toISOString() };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      checkpoint.pages[url] = { status: "failed", reason: message, at: new Date().toISOString() };
      console.error(JSON.stringify({ source, url, error: message }));
      if (error instanceof BlockedPageError) { interrupted = message; break; }
    }
    await writeJson(checkpointFile, checkpoint);
    if (visitedThisRun % 10 === 0) {
      const report = await emit("running");
      console.log(JSON.stringify({ source, visited_this_run: visitedThisRun, exported: report.exported_event_count, pending: report.missing_url_count }));
    }
  }
  const report = await emit(interrupted ? "blocked" : "partial");
  console.log(JSON.stringify({ source, state: report.state, exported: report.exported_event_count, pending: report.missing_url_count, inventory_complete: report.inventory_complete }));
  return report;
}

export async function runEventCli(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    source: { type: "string", default: "all" }, out: { type: "string", default: "exports/events" },
    "delay-ms": { type: "string", default: "2000" }, limit: { type: "string", default: "0" },
    city: { type: "string", default: "tehran" }, refresh: { type: "boolean", default: false },
    offline: { type: "boolean", default: false }, "export-only": { type: "boolean", default: false },
  } });
  if (!["all", "jabama", "davvvat"].includes(values.source!)) throw new Error("--source must be jabama, davvvat, or all");
  const delayMs = Number(values["delay-ms"]), limit = Number(values.limit);
  if (!Number.isSafeInteger(delayMs) || delayMs < 1500 || !Number.isSafeInteger(limit) || limit < 0) throw new Error("--delay-ms must be >=1500; --limit must be a non-negative integer");
  if (!["tehran", "all"].includes(values.city!)) throw new Error("--city must be tehran or all (Jabama scope only)");
  const out = path.resolve(values.out!); const release = await lock(out);
  let exportQueue = Promise.resolve<unknown>(null);
  const combined = () => { exportQueue = exportQueue.then(() => combineEvents(out)); return exportQueue; };
  try {
    if (values["export-only"]) { console.log(JSON.stringify(await combined())); return; }
    const sources: EventSource[] = values.source === "all" ? ["jabama", "davvvat"] : [values.source as EventSource];
    const results = await Promise.allSettled(sources.map(source => crawlSource({ out, source, delayMs, limit,
      refresh: values.refresh!, offline: values.offline!, city: values.city! }, combined)));
    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      if (result.status === "rejected") {
        const failure: Data = { source: sources[index], state: "failed", complete: false, updated_at: new Date().toISOString(), error: String(result.reason) };
        await writeJson(path.join(out, sources[index], "crawl-report.json"), failure); console.error(JSON.stringify(failure)); process.exitCode = 1;
      } else if (!result.value.complete) process.exitCode = 2;
    }
    await combined();
  } finally { await release(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runEventCli().catch(error => { console.error(error); process.exitCode = 1; });
}
