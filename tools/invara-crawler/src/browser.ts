import { appendFile } from "node:fs/promises";
import type { BrowserContext, Page, Response } from "playwright";
import { errorMessage, items, object, sleep, text } from "./model.js";
import type { Capture, Data, Discovery, DomSnapshot, Failure, Store, Taxon } from "./model.js";
import { normalizeStore } from "./normalize.js";

export interface CrawlOptions {
  origin: string;
  seedUrl: string;
  limit: number;
  out: string;
  delayMs: number;
  timeoutMs: number;
  retries: number;
  maxReviewPages: number;
  channel: string;
  headless: boolean;
  resume: boolean;
}

export function parseFilterDefinitions(source: string, sourceUrl: string): Taxon[] {
  const result: Taxon[] = [];
  for (const match of source.matchAll(/"(FOOD_FILTERS|FILTER_TAGS)",0,(\[[^\]]*\]|[\w$]+)/g)) {
    const kind = match[1] === "FOOD_FILTERS" ? "food" : "tag";
    let definition = match[2];
    if (!definition.startsWith("[")) {
      const identifier = definition.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const assignments = [...source.slice(0, match.index).matchAll(new RegExp(`(?:let|const|var|[,;])\\s*${identifier}\\s*=\\s*(\\[[^\\]]*\\])`, "g"))];
      definition = assignments.at(-1)?.[1] ?? "";
    }
    for (const pair of definition.matchAll(/\{code:"([^"\\]+)",label:"((?:\\.|[^"\\])*)"/g)) {
      result.push({ kind, code: pair[1], label_fa: JSON.parse(`"${pair[2]}"`) as string, filterable: true, source: sourceUrl });
    }
  }
  return result;
}

export class Observer {
  captures: Capture[] = [];
  taxonomy = new Map<string, Taxon>();
  pending = new Set<Promise<void>>();
  errors: Failure[] = [];
  pauseUntil = 0;
  private writes = Promise.resolve();

  constructor(page: Page, private origin: string, private journal: string) {
    page.on("response", response => {
      const job = this.observe(response).catch(error => {
        this.errors.push({ place_id: null, phase: "response", message: errorMessage(error), occurred_at: new Date().toISOString() });
      });
      this.pending.add(job);
      void job.finally(() => this.pending.delete(job));
    });
  }

  private async observe(response: Response) {
    const url = new URL(response.url());
    if (url.origin !== this.origin || response.request().method() !== "GET") return;
    if (response.request().resourceType() === "script" && url.pathname.startsWith("/_next/")) {
      if (!response.ok()) return;
      const source = await response.text();
      for (const taxon of parseFilterDefinitions(source, url.href)) this.taxonomy.set(`${taxon.kind}:${taxon.code}`, taxon);
      return;
    }
    const match = url.pathname.match(/^\/api\/v1\/places\/(search|[^/]+)(\/comments)?\/?$/);
    if (!match || ["liked", "saved-lists", "suggestions", "availability", "explore-defaults", "map-points", "metro-stations", "traffic-zone", "pollution-zone"].includes(match[1])) return;
    if (match[2] && (url.searchParams.get("scope") ?? "all") !== "all") return;
    if (!/json/i.test(response.headers()["content-type"] ?? "")) return;
    if (response.status() === 429) {
      const retryAfter = response.headers()["retry-after"];
      const milliseconds = retryAfter && /^\d+$/.test(retryAfter)
        ? Number(retryAfter) * 1000 : retryAfter ? Date.parse(retryAfter) - Date.now() : 30000;
      this.pauseUntil = Math.max(this.pauseUntil, Date.now() + Math.max(1000, milliseconds || 30000));
    }
    const capture: Capture = { url: url.href, status: response.status(), observed_at: new Date().toISOString(), body: await response.json() };
    this.captures.push(capture);
    this.writes = this.writes.then(() => appendFile(this.journal, `${JSON.stringify(capture)}\n`, "utf8"));
    await this.writes;
  }

  async flush() {
    while (this.pending.size) await Promise.all([...this.pending]);
    await this.writes;
  }

  async waitFor(predicate: (capture: Capture) => boolean, timeout: number): Promise<Capture> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const capture = this.captures.findLast(predicate);
      if (capture) {
        if (capture.status >= 400) throw new Error(`HTTP ${capture.status}: ${capture.url}: ${JSON.stringify(capture.body).slice(0, 300)}`);
        return capture;
      }
      await sleep(100);
    }
    throw new Error("Timed out waiting for public place data loaded by the page");
  }
}

export async function dismissTips(page: Page) {
  for (let count = 0; count < 4; count++) {
    const button = page.getByRole("button", { name: "فهمیدم", exact: true });
    if (!await button.isVisible()) break;
    await button.click();
  }
}

export async function paced(observer: Observer, milliseconds: number) {
  await sleep(Math.max(milliseconds, observer.pauseUntil - Date.now()));
}

export async function navigate(page: Page, url: string, options: CrawlOptions, observer: Observer) {
  const target = new URL(url);
  if (target.origin !== options.origin || !/^\/(explore\/?|places\/[^/]+\/?)$/.test(target.pathname)) throw new Error(`Refusing non-public navigation: ${url}`);
  for (let attempt = 0; ; attempt++) {
    try {
      await paced(observer, attempt ? Math.min(15000, 2000 * 2 ** (attempt - 1)) : options.delayMs);
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
      if (response && response.status() >= 400) throw new Error(`Page HTTP ${response.status()}: ${url}`);
      return;
    } catch (error) {
      if (attempt >= options.retries) throw error;
      console.log(`Retrying navigation (${attempt + 1}/${options.retries}): ${errorMessage(error).split("\n")[0]}`);
    }
  }
}

export function robotsAllowsPublicPath(robots: string, pathname: string): boolean {
  const rules: { allow: boolean; path: string }[] = [];
  let active = false;
  let previousWasAgent = false;
  for (const line of robots.split(/\r?\n/)) {
    const match = line.replace(/#.*$/, "").trim().match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (key === "user-agent") {
      active = previousWasAgent ? active || value === "*" : value === "*";
      previousWasAgent = true;
    } else {
      previousWasAgent = false;
      if (active && ["allow", "disallow"].includes(key) && value) rules.push({ allow: key === "allow", path: value });
    }
  }
  const matching = rules.filter(rule => {
    const expression = rule.path.split("*").map(part => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*").replace(/\\\$$/, "$");
    return new RegExp(`^${expression}`).test(pathname);
  }).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return matching[0]?.allow ?? true;
}

export async function readRobots(context: BrowserContext, origin: string, timeout: number): Promise<string> {
  const response = await context.request.get(`${origin}/robots.txt`, { timeout });
  if (response.status() === 404) return "# robots.txt returned 404";
  if (!response.ok()) throw new Error(`Cannot check robots.txt: HTTP ${response.status()}`);
  return response.text();
}

export async function discover(page: Page, observer: Observer, options: CrawlOptions, robots: string): Promise<Discovery> {
  if (!robotsAllowsPublicPath(robots, new URL(options.seedUrl).pathname)) throw new Error("robots.txt disallows the discovery page");
  await navigate(page, options.seedUrl, options, observer);
  await page.locator('a[href^="/places/"]').first().waitFor({ timeout: options.timeoutMs });
  await dismissTips(page);
  const ids = new Set<string>();
  for (;;) {
    const links = await page.locator('a[href^="/places/"]').evaluateAll(elements => elements.map(element => element.getAttribute("href") ?? ""));
    for (const href of links) {
      const id = new URL(href, options.origin).pathname.match(/^\/places\/([^/]+)\/?$/)?.[1];
      if (id) ids.add(decodeURIComponent(id));
    }
    console.log(`Discovery: ${ids.size} unique venues`);
    if (ids.size >= options.limit) break;
    const more = page.getByRole("button", { name: "نمایش مکان‌های بیشتر", exact: true });
    if (!await more.isVisible()) break;
    const previous = links.length;
    await paced(observer, options.delayMs);
    await more.click();
    await page.waitForFunction(count => document.querySelectorAll('a[href^="/places/"]').length > count, previous, { timeout: options.timeoutMs });
  }
  await observer.flush();
  const pages = observer.captures.filter(capture => new URL(capture.url).pathname.endsWith("/places/search") && capture.status === 200);
  const listings: Record<string, Data> = {};
  for (const page of pages) for (const item of items(page.body)) {
    const id = text(item.place_id);
    if (id) listings[id] = item;
  }
  if (ids.size < options.limit) throw new Error(`Only ${ids.size} venues discovered; requested ${options.limit}. No complete pilot was reported.`);
  return { origin: options.origin, seed_url: options.seedUrl, discovered_at: new Date().toISOString(), ids: [...ids], listings, pages, taxonomy: [...observer.taxonomy.values()], robots_txt: robots };
}

async function snapshot(page: Page): Promise<DomSnapshot> {
  return page.evaluate(() => ({
    title: document.title, name: document.querySelector("h1")?.textContent?.trim() ?? "",
    text: document.body.innerText,
    links: Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map(a => ({ text: (a.textContent ?? a.getAttribute("aria-label") ?? "").trim(), url: a.href })),
    photos: Array.from(document.querySelectorAll<HTMLImageElement>('main img, [aria-label="تصاویر مکان"] img'))
      .map(image => image.getAttribute("src") ?? "").filter(src => src.includes("/place_photos/")),
    meta: Object.fromEntries(Array.from(document.querySelectorAll<HTMLMetaElement>("meta[property],meta[name]"))
      .map(meta => [meta.getAttribute("property") ?? meta.name, meta.content])),
  }));
}

export async function collectStore(page: Page, observer: Observer, options: CrawlOptions, discovery: Discovery, id: string): Promise<Store> {
  const sourceUrl = new URL(`/places/${encodeURIComponent(id)}`, options.origin).href;
  if (!robotsAllowsPublicPath(discovery.robots_txt, new URL(sourceUrl).pathname)) throw new Error("robots.txt disallows this place page");
  const start = observer.captures.length;
  await navigate(page, sourceUrl, options, observer);
  const detailCapture = await observer.waitFor(capture => observer.captures.indexOf(capture) >= start
    && new URL(capture.url).pathname.endsWith(`/places/${encodeURIComponent(id)}`), options.timeoutMs);
  await page.getByRole("heading", { level: 1 }).waitFor({ timeout: options.timeoutMs });
  const detail = object(detailCapture.body);
  const reviewCaptures: Capture[] = [];
  const warnings: string[] = [];
  let reviewsComplete = false;
  try {
    let expectedPage = 1;
    for (let count = 0; count < options.maxReviewPages; count++) {
      const capture = await observer.waitFor(capture => observer.captures.indexOf(capture) >= start
        && new URL(capture.url).pathname.endsWith(`/places/${encodeURIComponent(id)}/comments`)
        && new URL(capture.url).searchParams.get("page") === String(expectedPage), options.timeoutMs);
      reviewCaptures.push(capture);
      const body = object(capture.body);
      if (!Array.isArray(body.items) || !("next_page" in body)) throw new Error("Unexpected review pagination shape");
      if (body.next_page === null) { reviewsComplete = true; break; }
      const nextPage = Number(body.next_page);
      if (!Number.isInteger(nextPage) || nextPage <= expectedPage) throw new Error("Review pagination did not advance");
      if (count + 1 === options.maxReviewPages) break;
      await dismissTips(page);
      await paced(observer, options.delayMs);
      // Pagination is a direct child of the all-reviews section; text expanders live inside its list.
      const section = page.getByRole("heading", { name: "همه نظرها", exact: true }).locator("..");
      await section.locator(":scope > button").filter({ hasText: "نمایش بیشتر" }).click({ timeout: options.timeoutMs });
      expectedPage = nextPage;
    }
    if (!reviewsComplete) warnings.push(`Reviews stopped at the configured ${options.maxReviewPages}-page limit`);
  } catch (error) { warnings.push(`Reviews incomplete: ${errorMessage(error).split("\n")[0]}`); }
  await observer.flush();
  return normalizeStore({ id, origin: options.origin, detail, listing: discovery.listings[id] ?? {},
    page: await snapshot(page), reviews: reviewCaptures.flatMap(capture => items(capture.body)),
    reviewPages: reviewCaptures.length, reviewsComplete, warnings });
}
