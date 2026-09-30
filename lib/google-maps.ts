export type GoogleMapsLocation = {
  url: string;
  lat: number | null;
  lng: number | null;
};

export function googleMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

/** Accept share links without requesting them or guessing their destination. */
export function parseGoogleMapsUrl(value: unknown): GoogleMapsLocation | null {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (!input || input.length > 2048 || /[\s\u0000-\u001f\u007f\\]/.test(input)) return null;
  let url: URL;
  try { url = new URL(input); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname;
  const path = url.pathname;
  if (host === "maps.app.goo.gl" || host === "goo.gl") {
    const valid = host === "maps.app.goo.gl"
      ? /^\/[A-Za-z0-9_-]+\/?$/.test(path)
      : /^\/maps\/[A-Za-z0-9_-]+\/?$/.test(path);
    return valid ? { url: url.href, lat: null, lng: null } : null;
  }
  if (!["google.com", "www.google.com", "maps.google.com"].includes(host)) return null;
  const params = url.searchParams;
  for (const key of ["q", "query", "query_place_id", "cid", "api"])
    if (params.getAll(key).length > 1) return null;
  const q = params.get("q")?.trim();
  const query = params.get("query")?.trim();
  const cid = params.get("cid");
  if (q && query) return null;
  let decodedPath: string;
  try { decodedPath = decodeURIComponent(path); } catch { return null; }
  const namedSegment = decodedPath.match(/^\/maps\/(?:place|search)\/([^/]+)/)?.[1];
  const namedPlace = Boolean(namedSegment && !/^(?:@|data=)/.test(namedSegment));
  const queryRoute = /^\/maps(?:\/search)?\/?$/.test(path) ||
    (host === "maps.google.com" && path === "/");
  const validQuery = queryRoute && Boolean(q || query || (cid && /^\d+$/.test(cid)));
  if (!namedPlace && !validQuery) return null;
  if (query && (!/^\/maps\/search\/?$/.test(path) || params.get("api") !== "1")) return null;
  let lat: number | null = null;
  let lng: number | null = null;
  // Place IDs override a query; @/center/ll values describe the viewport, not a venue.
  if (queryRoute && !params.has("query_place_id") && !params.has("cid")) {
    const pair = (query || q || "").match(/^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)$/);
    if (pair) {
      const latitude = Number(pair[1]), longitude = Number(pair[2]);
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
      lat = latitude;
      lng = longitude;
    }
  }
  return { url: url.href, lat, lng };
}
