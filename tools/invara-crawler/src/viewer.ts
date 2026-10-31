import { createServer, type ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { buildCatalogue, galleryImages, searchCatalogue } from "./viewer-data.js";
import type { Store } from "./model.js";
import type { EventRecord } from "./events/model.js";
import { buildEventCatalogue, searchEvents } from "./events/viewer.js";
import { readJson } from "./output.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const downloadNames = new Set(["stores.csv", "stores.json", "invara.json", "photos.csv", "reviews.csv", "taxonomy.csv", "invara-all-public.zip"]);
const assets: Record<string, { file: string; type: string }> = {
  "/": { file: "viewer/index.html", type: "text/html; charset=utf-8" },
  "/styles.css": { file: "viewer/styles.css", type: "text/css; charset=utf-8" },
  "/app.js": { file: "dist/viewer-client.js", type: "text/javascript; charset=utf-8" },
  "/events-app.js": { file: "dist/events-client.js", type: "text/javascript; charset=utf-8" },
  "/places": { file: "viewer/index.html", type: "text/html; charset=utf-8" },
  "/events": { file: "viewer/events.html", type: "text/html; charset=utf-8" },
  "/font.woff2": { file: "viewer/darbareh-variable.woff2", type: "font/woff2" },
  "/favicon.svg": { file: "viewer/favicon.svg", type: "image/svg+xml" },
};

export async function createViewerServer(out: string, eventsOut = path.resolve(out, "..", "events")) {
  const stores = JSON.parse(await readFile(path.join(out, "stores.json"), "utf8")) as Store[];
  if (!Array.isArray(stores) || !stores.length || stores.some(store => !store.place_id || !Array.isArray(store.photos))) {
    throw new Error("No valid venue export found. Choose an export folder containing stores.json.");
  }
  const catalogue = buildCatalogue(stores);
  let events = buildEventCatalogue([]);
  let eventsMtime = -1;
  async function reloadEvents() {
    const file = path.join(eventsOut, "events.json");
    const mtime = await stat(file).then(info => info.mtimeMs, () => 0);
    if (mtime === eventsMtime) return;
    const data = await readJson<EventRecord[]>(file) ?? [];
    if (!Array.isArray(data) || data.some(event => !event.event_id || !Array.isArray(event.photos) || !Array.isArray(event.categories))) throw new Error("Invalid event export");
    const report = await readJson<{ exported_at?: string; reports?: unknown }>(path.join(eventsOut, "run-report.json")) ?? {};
    events = buildEventCatalogue(data, report); eventsMtime = mtime;
  }
  await reloadEvents();
  let capturedAt: string | null = null;
  try { capturedAt = (JSON.parse(await readFile(path.join(out, "run-report.json"), "utf8")) as { exported_at?: string }).exported_at ?? null; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const hasArchive = await stat(path.join(out, "invara-all-public.zip")).then(file => file.isFile(), () => false);
  const json = (response: ServerResponse, value: unknown, status = 200, filename?: string) => {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
      ...(filename ? { "Content-Disposition": `attachment; filename="${filename}"` } : {}) });
    response.end(JSON.stringify(value));
  };
  const server = createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' https: http:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) { json(response, { error: "Local access only" }, 403); return; }
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD"); json(response, { error: "Method not allowed" }, 405); return;
      }
      if (url.pathname === "/api/meta") {
        await reloadEvents();
        json(response, { total: stores.length, categories: catalogue.categories, captured_at: capturedAt, has_archive: hasArchive, event_count: events.meta.total }); return;
      }
      if (url.pathname === "/api/events/meta") { await reloadEvents(); json(response, events.meta); return; }
      if (url.pathname === "/api/events") {
        await reloadEvents();
        try { json(response, searchEvents(events, url.searchParams)); }
        catch (error) { json(response, { error: error instanceof Error ? error.message : "فیلتر معتبر نیست." }, 400); }
        return;
      }
      const eventDetail = url.pathname.match(/^\/api\/events\/([^/]+)$/);
      if (eventDetail) {
        await reloadEvents();
        const event = events.byId.get(decodeURIComponent(eventDetail[1]));
        if (!event) { json(response, { error: "رویداد پیدا نشد." }, 404); return; }
        json(response, event, 200, url.searchParams.get("download") === "1" ? `${encodeURIComponent(event.event_id)}.json` : undefined); return;
      }
      if (url.pathname === "/api/stores") {
        try { json(response, searchCatalogue(catalogue, url.searchParams)); }
        catch (error) { json(response, { error: error instanceof Error ? error.message : "فیلتر معتبر نیست." }, 400); }
        return;
      }
      const detail = url.pathname.match(/^\/api\/stores\/([^/]+)$/);
      if (detail) {
        const id = decodeURIComponent(detail[1]);
        const store = catalogue.byId.get(id);
        if (!store) { json(response, { error: "مکان پیدا نشد." }, 404); return; }
        json(response, url.searchParams.get("download") === "1" ? store : { store, gallery: galleryImages(store.photos) }, 200,
          url.searchParams.get("download") === "1" ? `invara-${encodeURIComponent(id)}.json` : undefined);
        return;
      }
      let file: string | undefined;
      let type: string | undefined;
      if (assets[url.pathname]) {
        if (url.pathname === "/") await reloadEvents();
        const asset = url.pathname === "/" && events.meta.total ? assets["/events"] : assets[url.pathname];
        ({ file, type } = { file: path.join(root, asset.file), type: asset.type });
      }
      else if (url.pathname.startsWith("/download/events/")) {
        const name = url.pathname.slice("/download/events/".length);
        const allowed = /^(?:(jabama|davvvat)\/)?(events\.(json|csv)|photos\.(json|csv)|categories\.(json|csv)|taxonomy\.csv|catalogue\.json|run-report\.json|crawl-report\.json)$/;
        if (allowed.test(name)) {
          file = path.join(eventsOut, name);
          type = name.endsWith(".csv") ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";
          response.setHeader("Content-Disposition", `attachment; filename="${path.basename(name)}"`);
        }
      }
      else if (url.pathname.startsWith("/download/")) {
        const name = url.pathname.slice("/download/".length);
        if (downloadNames.has(name)) {
          file = path.join(out, name);
          type = name.endsWith(".zip") ? "application/zip" : name.endsWith(".csv") ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";
          response.setHeader("Content-Disposition", `attachment; filename="${name}"`);
        }
      }
      if (!file || !type) { json(response, { error: "Not found" }, 404); return; }
      const info = await stat(file);
      if (!info.isFile()) { json(response, { error: "Not found" }, 404); return; }
      response.writeHead(200, { "Content-Type": type, "Content-Length": info.size, "Cache-Control": "no-cache" });
      if (request.method === "HEAD") response.end();
      else createReadStream(file).on("error", () => response.destroy()).pipe(response);
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      json(response, { error: missing ? "File not found" : "درخواست پردازش نشد." }, missing ? 404 : 500);
    }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { out: { type: "string", default: "exports/all-public" }, events: { type: "string", default: "exports/events" }, port: { type: "string", default: "4318" } } });
  const port = Number(values.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("Port must be between 1 and 65535");
  const server = await createViewerServer(path.resolve(values.out!), path.resolve(values.events!));
  server.on("error", error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, "127.0.0.1", () => console.log(`Event & place catalogue: http://127.0.0.1:${port}`));
  const stop = () => { server.close(); server.closeIdleConnections(); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
}
