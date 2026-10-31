import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "../output.js";
import { SOURCE_ORIGINS, type EventSource } from "./model.js";

export const CRAWLER_AGENT = "EventCatalogueCrawler";
export class BlockedPageError extends Error {}
export interface HtmlCapture { url: string; fetched_at: string; status: number; text: string; cached: boolean }
export interface RobotsRule { allow: boolean; path: string }

export function robotsRules(text: string, agent = CRAWLER_AGENT): RobotsRule[] {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  let group: (typeof groups)[number] | null = null;
  let hasRules = false;
  for (const line of text.split(/\r?\n/)) {
    const clean = line.replace(/#.*$/, "").trim();
    const colon = clean.indexOf(":"); if (colon < 0) continue;
    const key = clean.slice(0, colon).trim().toLowerCase(), value = clean.slice(colon + 1).trim();
    if (key === "user-agent") {
      if (!group || hasRules) { group = { agents: [], rules: [] }; groups.push(group); hasRules = false; }
      group.agents.push(value.toLowerCase());
    } else if (group && ["allow", "disallow"].includes(key)) {
      hasRules = true;
      if (value) group.rules.push({ allow: key === "allow", path: value });
    }
  }
  const specific = groups.filter(group => group.agents.some(value => value !== "*" && agent.toLowerCase().includes(value)));
  return (specific.length ? specific : groups.filter(group => group.agents.includes("*"))).flatMap(group => group.rules);
}

export function robotsAllowed(url: string, rules: RobotsRule[]): boolean {
  const parsed = new URL(url), target = parsed.pathname + parsed.search;
  let best: RobotsRule | undefined, length = -1;
  for (const rule of rules) {
    const expression = rule.path.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replaceAll("*", ".*").replace(/\$$/, "$");
    if (!new RegExp(`^${expression}`).test(target)) continue;
    const size = rule.path.replaceAll("*", "").length;
    if (size > length || (size === length && rule.allow)) { best = rule; length = size; }
  }
  return best?.allow ?? true;
}

export function retryAfterMs(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  if (/^\d+(\.\d+)?$/.test(value.trim())) return Math.ceil(Number(value) * 1000);
  const date = Date.parse(value); return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

export class PublicHtmlClient {
  private lastRequest = 0;
  private rules: RobotsRule[] = [];
  private cooldownUntil = 0;
  private restored = false;
  constructor(readonly source: EventSource, readonly cache: string, readonly delayMs = 2000, readonly offline = false) {}

  setRobots(text: string) { this.rules = robotsRules(text); }
  cacheKey(url: string) { return createHash("sha256").update(url).digest("hex"); }
  private assertPublic(url: string) {
    const parsed = new URL(url);
    if (parsed.origin !== SOURCE_ORIGINS[this.source] || parsed.username || parsed.password) throw new Error("Cross-origin crawl refused");
    if (/^\/(?:api|cms-api|admin|cms-graphql|checkout|profile|tickets|wallet|onboarding|settings|notifications|go)(?:\/|$)/i.test(parsed.pathname)) throw new Error("Private or disallowed route refused");
    if (!robotsAllowed(url, this.rules)) throw new Error(`robots.txt disallows ${parsed.pathname}`);
  }

  async get(url: string, refresh = false): Promise<HtmlCapture> {
    this.assertPublic(url);
    const key = this.cacheKey(url), file = path.join(this.cache, `${key}.html`), metaFile = path.join(this.cache, `${key}.json`);
    const saved = await readJson<Omit<HtmlCapture, "text" | "cached">>(metaFile);
    if (saved && (!refresh || this.offline)) return { ...saved, text: await readFile(file, "utf8"), cached: true };
    if (this.offline) throw new Error(`No cached page: ${url}`);
    if (!this.restored) {
      this.cooldownUntil = (await readJson<{ until: number }>(path.join(this.cache, "backoff.json")))?.until ?? 0;
      this.restored = true;
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const wait = Math.max(this.lastRequest + this.delayMs, this.cooldownUntil) - Date.now();
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      this.lastRequest = Date.now();
      let response: Response;
      try {
        response = await fetch(url, { headers: { "User-Agent": `${CRAWLER_AGENT}/1.0 (public event catalogue; respects robots.txt)`, Accept: "text/html,application/xml,text/plain;q=0.9" },
          signal: AbortSignal.timeout(45000), redirect: "manual" });
      } catch (error) {
        if (attempt === 3) throw error;
        this.cooldownUntil = Date.now() + 5000 * 2 ** attempt; continue;
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const target = new URL(response.headers.get("location") ?? "", url).href;
        this.assertPublic(target);
        throw new Error(`Redirect recorded; review canonical public URL: ${target}`);
      }
      if ([429, 500, 502, 503, 504].includes(response.status)) {
        const pause = Math.max(retryAfterMs(response.headers.get("retry-after")) ?? 0, 15000 * 2 ** attempt);
        this.cooldownUntil = Date.now() + pause;
        await writeJson(path.join(this.cache, "backoff.json"), { until: this.cooldownUntil, status: response.status, url });
        console.log(JSON.stringify({ source: this.source, state: "backoff", status: response.status, retry_at: new Date(this.cooldownUntil).toISOString(), url }));
        await response.body?.cancel();
        if (attempt === 3) throw new BlockedPageError(`Server ${response.status}; resume after ${new Date(this.cooldownUntil).toISOString()}`);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        if ([401, 403].includes(response.status)) throw new BlockedPageError(`HTTP ${response.status}; access denied: ${url}`);
        throw new Error(`HTTP ${response.status}: ${url}`);
      }
      const type = response.headers.get("content-type") ?? "";
      if (!/html|xml|text\/plain|application\/octet-stream/i.test(type)) { await response.body?.cancel(); throw new Error(`Unexpected content type: ${type}`); }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = []; let length = 0;
      if (reader) for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.length;
        if (length > 8 * 1024 * 1024) { await reader.cancel(); throw new Error("Public page exceeded 8 MB limit"); }
        chunks.push(value);
      }
      const text = Buffer.concat(chunks).toString("utf8");
      if (/Request Rejected|captcha|cf-chl-|Access Denied|verify you are human/i.test(text.slice(0, 12000))) {
        throw new BlockedPageError(`Public page rejected access: ${url}`);
      }
      const meta = { url, fetched_at: new Date().toISOString(), status: response.status };
      await mkdir(this.cache, { recursive: true });
      await writeFile(file, text); await writeJson(metaFile, meta);
      return { ...meta, text, cached: false };
    }
    throw new Error("Request retries exhausted");
  }
}
