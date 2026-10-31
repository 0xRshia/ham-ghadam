import { load } from "cheerio";
import { object, type Data } from "../model.js";
import { eventIdentity, davvvatObjects } from "./adapters.js";
import { parsePage, walkObjects } from "./html.js";
import { PublicHtmlClient } from "./http.js";
import { SOURCE_ORIGINS, type EventInventory, type EventSource } from "./model.js";

export async function discoverEvents(source: EventSource, client: PublicHtmlClient, refresh = false): Promise<EventInventory> {
  const origin = SOURCE_ORIGINS[source];
  const inventory: EventInventory = { source, seed_url: source === "jabama" ? `${origin}/all?city=tehran` : `${origin}/`,
    discovered_at: new Date().toISOString(), complete: true, urls: [], listings: {}, audits: [], robots_txt: "" };
  const targets = new Map<string, string>();
  const add = (url: string, listing?: Data) => {
    const identity = eventIdentity(source, url); if (!identity) return;
    const key = `${identity.kind}:${identity.id}`;
    targets.set(key, identity.url);
    if (listing) inventory.listings[identity.url] = listing;
  };
  const robots = await client.get(`${origin}/robots.txt`, refresh);
  inventory.robots_txt = robots.text; client.setRobots(robots.text);
  const sitemapUrls = [...new Set([`${origin}/sitemap.xml`, ...[...robots.text.matchAll(/^Sitemap:\s*(\S+)/gmi)].map(match => match[1])])];
  const visited = new Set<string>();
  for (let index = 0; index < sitemapUrls.length && index < 30; index++) {
    const url = sitemapUrls[index]; if (visited.has(url)) continue; visited.add(url);
    try {
      const capture = await client.get(url, refresh), $ = load(capture.text, { xml: true });
      if (!$("urlset,sitemapindex").length) throw new Error("Not a sitemap document");
      const links = $("loc").toArray().map(node => $(node).text().trim());
      for (const link of links) {
        if (new URL(link).origin !== origin) continue;
        if ($("sitemapindex").length && /\.xml$/.test(new URL(link).pathname)) sitemapUrls.push(link);
        else add(link);
      }
      inventory.audits.push({ kind: "sitemap", url, ok: true, url_count: links.length, captured_at: capture.fetched_at });
    } catch (error) {
      inventory.complete = false;
      inventory.audits.push({ kind: "sitemap", url, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (sitemapUrls.length > 30) inventory.complete = false;
  try {
    const capture = await client.get(inventory.seed_url, refresh);
    const page = parsePage(capture.text, inventory.seed_url);
    for (const link of page.links) add(link.url);
    if (source === "davvvat") for (const listing of davvvatObjects(page)) {
      if (listing.isPrivate !== true) add(`${origin}/event/${listing.slug}`, listing);
    }
    else {
      const route = object(object(page.router?.loaderData)["routes/all"]);
      for (const item of walkObjects(route)) {
        if (!item.id || !item.title) continue;
        if (item.cityKey) add(`${origin}/theaters/${item.id}`, item);
        else if (item.category || item.media) add(`${origin}/events/${item.id}`, item);
      }
      inventory.audits.push({ kind: "city-listing", url: inventory.seed_url, total_reported: route.total ?? null,
        note: "City page is curated. Sitemap event details are checked individually for Tehran; curated page count is not treated as complete inventory." });
    }
    inventory.audits.push({ kind: "public-listing", url: inventory.seed_url, ok: true, captured_at: capture.fetched_at });
  } catch (error) {
    inventory.complete = false;
    inventory.audits.push({ kind: "public-listing", url: inventory.seed_url, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
  inventory.urls = [...targets.values()];
  if (!inventory.urls.length) throw new Error(`No public event URLs discovered for ${source}`);
  return inventory;
}
