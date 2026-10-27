import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { collectStore, discover, Observer, readRobots } from "./browser.js";
import type { CrawlOptions } from "./browser.js";
import { errorMessage } from "./model.js";
import type { Discovery, Failure, Store } from "./model.js";
import { csv, exportRun, readJson, writeJson } from "./output.js";

const help = `Invara public venue crawler (Node 22.13+)

  npm run build
  npm run crawl -- --limit 50 --out ./exports/pilot-50
  npm run crawl -- export --out ./exports/pilot-50

Options:
  --limit N               Number of distinct venue details to collect (default: 50)
  --out DIRECTORY         Export/checkpoint directory (default: ./exports/pilot-50)
  --delay-ms N            Minimum delay between page/pagination actions (default: 1500)
  --timeout-ms N          Timeout per navigation/data response (default: 45000)
  --retries N             Additional attempts per navigation/store (default: 2)
  --max-review-pages N    Review pagination safety limit per venue (default: 100)
  --channel NAME          Installed browser channel (default: chrome; chromium for bundled)
  --headed               Show the crawler browser
  --no-resume            Revisit selected venues, replacing their cached records
  --origin URL            Site origin (default: https://invara.top; localhost for fixtures)
  --seed-url URL          Public discovery URL on that origin (default: /explore)
  --help                  Show this help

Resume is automatic. The export command rebuilds JSON/CSV offline from checkpoints.
The crawler uses public pages and observes their GET place responses. It never
directly calls place APIs, signs in, downloads photo files, or follows external links.
`;

function integer(value: string | undefined, fallback: number, min: number, max: number, label: string) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`${label} must be an integer from ${min} to ${max}`);
  return parsed;
}

export function parseOptions(args: string[]): { command: string; options: CrawlOptions; help: boolean } {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    limit: { type: "string" }, out: { type: "string" }, "delay-ms": { type: "string" },
    "timeout-ms": { type: "string" }, retries: { type: "string" }, "max-review-pages": { type: "string" },
    channel: { type: "string" }, headed: { type: "boolean" }, "no-resume": { type: "boolean" },
    origin: { type: "string" }, "seed-url": { type: "string" }, help: { type: "boolean" },
  } });
  const originUrl = new URL(values.origin ?? "https://invara.top");
  if (!["https:", "http:"].includes(originUrl.protocol) || originUrl.username || originUrl.password) throw new Error("Origin must be an HTTP(S) origin without credentials");
  const origin = originUrl.origin;
  const seedUrl = new URL(values["seed-url"] ?? "/explore", origin).href;
  if (new URL(seedUrl).origin !== origin) throw new Error("Seed URL must use the selected origin");
  const limit = integer(values.limit, 50, 1, 100000, "limit");
  const command = positionals[0] ?? "crawl";
  if (!["crawl", "export"].includes(command) || positionals.length > 1) throw new Error("Command must be crawl or export");
  return { command, help: values.help ?? false, options: {
    origin, seedUrl, limit, out: path.resolve(values.out ?? `exports/pilot-${limit}`),
    delayMs: integer(values["delay-ms"], 1500, 0, 60000, "delay-ms"),
    timeoutMs: integer(values["timeout-ms"], 45000, 1000, 300000, "timeout-ms"),
    retries: integer(values.retries, 2, 0, 5, "retries"),
    maxReviewPages: integer(values["max-review-pages"], 100, 1, 10000, "max-review-pages"),
    channel: values.channel ?? "chrome", headless: !values.headed, resume: !values["no-resume"],
  } };
}

async function exportCaptures(out: string) {
  let journal: string;
  try { journal = await readFile(path.join(out, "source-responses.ndjson"), "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const lines = journal.trim().split("\n").filter(Boolean);
  const responses = lines.map(line => JSON.parse(line) as Record<string, unknown>);
  await writeJson(path.join(out, "source-responses.json"), responses);
  await (await import("node:fs/promises")).writeFile(path.join(out, "source-responses.csv"), csv(responses, ["url", "status", "observed_at", "body"]));
}

export async function run(options: CrawlOptions, command = "crawl") {
  await mkdir(path.join(options.out, "checkpoints"), { recursive: true });
  const statePath = path.join(options.out, "checkpoint.json");
  const previous = await readJson<{ started_at: string; limit: number; discovery: Discovery; failures: Failure[] }>(statePath);
  if (previous && (previous.discovery.origin !== options.origin || previous.discovery.seed_url !== options.seedUrl)) throw new Error("Output folder belongs to a different source; choose another --out directory");
  const startedAt = previous?.started_at ?? new Date().toISOString();
  const failures = previous?.failures ?? [];
  let discovery = previous?.discovery ?? null;
  const stores: Store[] = [];
  let browser: Browser | null = null;
  let observer: Observer | null = null;
  let interrupted = false;
  const signal = () => { interrupted = true; console.log("Stopping after the current venue; checkpoints will be kept."); };
  process.once("SIGINT", signal);
  process.once("SIGTERM", signal);
  try {
    if (command === "crawl") {
      browser = await chromium.launch({ ...(options.channel === "chromium" ? {} : { channel: options.channel }), headless: options.headless });
      const context = await browser.newContext({ locale: "fa-IR", viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
      const page = await context.newPage();
      page.setDefaultTimeout(options.timeoutMs);
      observer = new Observer(page, options.origin, path.join(options.out, "source-responses.ndjson"));
      const robots = await readRobots(context, options.origin, options.timeoutMs);
      if (!discovery || discovery.ids.length < options.limit) {
        discovery = await discover(page, observer, options, robots);
      } else discovery.robots_txt = robots;
      await writeJson(statePath, { started_at: startedAt, limit: options.limit, discovery, failures });
      const selected = discovery.ids.slice(0, options.limit);
      for (const [index, id] of selected.entries()) {
        if (interrupted) break;
        const cache = path.join(options.out, "checkpoints", `${encodeURIComponent(id)}.json`);
        const saved = options.resume ? await readJson<Store>(cache) : null;
        if (saved?.place_id === id && saved.source_url === new URL(`/places/${encodeURIComponent(id)}`, options.origin).href && saved.reviews_complete && !saved.warnings.length) {
          stores.push(saved);
          console.log(`[${index + 1}/${selected.length}] Cached: ${saved.name}`);
          continue;
        }
        for (let attempt = 0; attempt <= options.retries; attempt++) {
          try {
            const store = await collectStore(page, observer, options, discovery, id);
            await writeJson(cache, store);
            if (!store.reviews_complete && attempt < options.retries) throw new Error(store.warnings.join("; "));
            stores.push(store);
            console.log(`[${index + 1}/${selected.length}] ${store.name}: ${store.photos.filter(photo => photo.kind === "venue").length} venue photo URLs, ${store.reviews.length} reviews${store.warnings.length ? `; ${store.warnings.join("; ")}` : ""}`);
            break;
          } catch (error) {
            failures.push({ place_id: id, phase: `store_attempt_${attempt + 1}`, message: errorMessage(error), occurred_at: new Date().toISOString() });
            console.error(`[${index + 1}/${selected.length}] Attempt ${attempt + 1}: ${errorMessage(error).split("\n")[0]}`);
          }
        }
        discovery.taxonomy = [...new Map([...discovery.taxonomy, ...observer.taxonomy.values()].map(item => [`${item.kind}:${item.code}`, item])).values()];
        await writeJson(statePath, { started_at: startedAt, limit: options.limit, discovery, failures });
      }
      await observer.flush();
      failures.push(...observer.errors);
    } else {
      if (!discovery || !previous) throw new Error("No checkpoint found; run the crawler first");
      options.limit = previous.limit;
      for (const id of discovery.ids.slice(0, options.limit)) {
        const cached = await readJson<Store>(path.join(options.out, "checkpoints", `${encodeURIComponent(id)}.json`));
        if (cached) stores.push(cached);
      }
    }
  } finally {
    if (observer) await observer.flush();
    if (browser) await browser.close();
    process.removeListener("SIGINT", signal);
    process.removeListener("SIGTERM", signal);
    if (discovery) {
      // A failed resumed navigation/setup must not replace previously exported data with an empty set.
      const savedById = new Map(stores.map(store => [store.place_id, store]));
      stores.length = 0;
      for (const id of discovery.ids.slice(0, options.limit)) {
        const saved = savedById.get(id) ?? await readJson<Store>(path.join(options.out, "checkpoints", `${encodeURIComponent(id)}.json`));
        if (saved?.place_id === id) stores.push(saved);
      }
      await writeJson(statePath, { started_at: startedAt, limit: options.limit, discovery, failures });
      const report = await exportRun(options.out, discovery, stores, failures, options.limit, startedAt);
      await exportCaptures(options.out);
      console.log(`Exported ${report.exported_store_count}/${report.requested_store_count} stores; ${report.venue_photo_url_count} venue photo URLs, ${report.review_count} reviews. Output: ${options.out}`);
    }
  }
  if (stores.length !== options.limit || stores.some(store => !store.reviews_complete)) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
  try {
    const parsed = parseOptions(process.argv.slice(2));
    if (parsed.help) console.log(help);
    else await run(parsed.options, parsed.command);
  } catch (error) {
    console.error(errorMessage(error));
    process.exitCode = 1;
  }
}
