import { navigate, Observer, robotsAllowsPublicPath } from "./browser.js";
import type { CrawlOptions } from "./browser.js";
import type { Page } from "playwright";
import { errorMessage, items, object, text } from "./model.js";
import type { Discovery, SearchCoverage } from "./model.js";

export async function discoverAll(page: Page, observer: Observer, options: CrawlOptions, robots: string,
  previous: Discovery | null, onProgress: (discovery: Discovery) => Promise<void>): Promise<Discovery> {
  const discovery: Discovery = previous?.scope === "all_public" ? previous : {
    scope: "all_public", exhausted: false, searches: [], origin: options.origin,
    seed_url: options.seedUrl, discovered_at: new Date().toISOString(), ids: [], listings: {}, pages: [], taxonomy: [], robots_txt: robots,
  };
  discovery.robots_txt = robots;
  discovery.searches ??= [];
  const audit = async (url: string) => {
    if (!robotsAllowsPublicPath(robots, new URL(url).pathname)) throw new Error(`robots.txt disallows ${url}`);
    const old = discovery.searches?.find(search => search.url === url);
    if (old?.exhausted && !old.error && options.resume) return;
    for (let attempt = 0; attempt <= options.retries; attempt++) {
      const search: SearchCoverage = { url, kind: "map", page_numbers: [], place_ids: [], exhausted: false, last_next_page: null, error: null };
      discovery.searches = [...(discovery.searches ?? []).filter(item => item.url !== url), search];
      try {
        const after = observer.captures.length;
        await navigate(page, url, options, observer);
        const capture = await observer.waitFor(capture => observer.captures.indexOf(capture) >= after
          && new URL(capture.url).pathname.endsWith("/places/map-points"), options.timeoutMs);
        const body = object(capture.body);
        if (!Array.isArray(body.items)) throw new Error("Unexpected public map data shape");
        const ids = new Set(discovery.ids);
        const searchIds = new Set<string>();
        for (const item of items(body)) {
          const id = text(item.place_id);
          if (!id) throw new Error("A public map record has no place_id");
          ids.add(id); searchIds.add(id);
          discovery.listings[id] = { ...discovery.listings[id], ...item };
        }
        discovery.ids = [...ids]; search.place_ids = [...searchIds];
        search.page_numbers = [1];
        const total = typeof body.total === "number" ? body.total : null;
        search.exhausted = !body.next_page && !body.has_more && !body.truncated && (total === null || total <= body.items.length);
        discovery.pages.push({ ...capture, body: { item_count: body.items.length, total, truncated: body.truncated ?? null } });
        await observer.flush();
        discovery.taxonomy = [...new Map([...discovery.taxonomy, ...observer.taxonomy.values()].map(item => [`${item.kind}:${item.code}`, item])).values()];
        if (!search.exhausted) throw new Error("Map response indicates truncated results");
        await onProgress(discovery);
        console.log(`Map inventory ${new URL(url).search}: ${search.place_ids.length} places; ${discovery.ids.length} unique overall`);
        return;
      } catch (error) {
        search.error = errorMessage(error).split("\n")[0];
        if (search.error.startsWith("HTTP 409:")) {
          search.unavailable_reason = search.error;
          search.error = null;
          search.exhausted = true;
          await onProgress(discovery);
          console.log(`Outside the site's supported service area: ${url}`);
          return;
        }
        await onProgress(discovery);
        console.error(`Map inventory attempt ${attempt + 1}: ${search.error}`);
      }
    }
  };
  const mapUrl = (parameter?: string, value?: string) => {
    const url = new URL(options.seedUrl);
    url.searchParams.set("view", "map");
    if (parameter) url.searchParams.set(parameter, value ?? "true");
    return url;
  };
  await audit(mapUrl().href);
  const filters = discovery.taxonomy.filter(item => item.filterable);
  for (const filter of filters) await audit(mapUrl(filter.kind === "food" ? "food" : "tag", filter.code).href);
  for (const parameter of ["near_metro", "avoid_traffic_zone", "avoid_pollution_zone"]) await audit(mapUrl(parameter).href);
  // Overlapping circles test whether the default 50 km circle concealed records.
  for (const [lat, lng] of [[35.79, 51.389], [35.59, 51.389], [35.6892, 51.25], [35.6892, 51.53]]) {
    const url = mapUrl();
    url.searchParams.set("lat", String(lat)); url.searchParams.set("lng", String(lng)); url.searchParams.set("radius", "50000");
    await audit(url.href);
  }
  discovery.exhausted = filters.length > 0 && discovery.ids.length > 0 && discovery.searches.every(search => search.exhausted && !search.error);
  await onProgress(discovery);
  return discovery;
}
