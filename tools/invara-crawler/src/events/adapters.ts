import { object, type Data } from "../model.js";
import { safeHttpUrl } from "../viewer-data.js";
import { parsePage, plainText, walkObjects, type ParsedPage } from "./html.js";
import { categorizeEvent, SOURCE_ORIGINS, type EventPhoto, type EventRecord, type EventSource } from "./model.js";

const str = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const num = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const arr = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const objects = (value: unknown): Data[] => arr(value).map(object);
const iso = (value: unknown): string | null => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
const datePart = (value: unknown): string | null => iso(value)?.slice(0, 10) ?? null;
const tehranDate = (value: string | null) => value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : null;
const tehranTime = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : null;
const text = (value: unknown): string | null => plainText(value) || null;
const canonical = (source: EventSource, path: string) => new URL(path, SOURCE_ORIGINS[source]).href;

export function eventIdentity(source: EventSource, url: string): { id: string; kind: string; url: string } | null {
  const parsed = new URL(url);
  if (parsed.origin !== SOURCE_ORIGINS[source]) return null;
  const match = source === "jabama" ? parsed.pathname.match(/^\/(events|theaters)\/([\w-]+)\/?$/)
    : parsed.pathname.match(/^\/(event)\/([\w-]+)\/(.+?)\/?$/);
  if (!match) return null;
  parsed.search = ""; parsed.hash = "";
  return { id: match[2], kind: match[1], url: parsed.href };
}

function seoEvent(page: ParsedPage): Data {
  return [...walkObjects(page.jsonld)].find(item => item["@type"] === "Event" || arr(item["@type"]).includes("Event")) ?? {};
}

function base(source: EventSource, id: string, url: string, raw: Data, page: ParsedPage, fetchedAt: string): EventRecord {
  return {
    event_id: `${source}:${id}`, source, source_id: id, source_url: url, fetched_at: fetchedAt,
    title: "", description: "", source_categories: [], categories: [], city: null, city_code: null, area: null,
    venue: null, address: null, latitude: null, longitude: null, location_precision: null, map_url: null,
    organizer: { name: null, url: null, avatar_url: null, raw: null },
    start_date: null, end_date: null, start_time: null, end_time: null, start_at: null, end_at: null,
    date_text: null, schedule_type: null, timezone: "Asia/Tehran", sessions: [],
    price: { amount: null, currency: null, text: null, is_free: null, raw: null },
    status: null, duration: null, booking_url: null, tags: [], photos: [], videos: [], reviews: [], terms: null,
    raw_event: raw, raw_page: { title: page.title, heading: page.heading, text: page.text, meta: page.meta, jsonld: page.jsonld }, warnings: [],
  };
}

function photos(input: { value: unknown; role: string }[]): EventPhoto[] {
  const result = new Map<string, EventPhoto>();
  for (const { value, role } of input) {
    const raw = object(value);
    const url = safeHttpUrl(typeof value === "string" ? value : raw.url ?? raw.imageUrl ?? raw.src ?? raw.original_url);
    if (url && !result.has(url)) result.set(url, { url, thumbnail_url: safeHttpUrl(raw.thumbnail_url ?? raw.thumbnailUrl), role, raw: value });
  }
  return [...result.values()];
}

export function jabamaRoute(page: ParsedPage): Data {
  const loaders = object(page.router?.loaderData);
  return Object.values(loaders).map(object).find(route => object(route.event).id || object(route.theater).id || object(route.theaterEvent).id) ?? {};
}

export function parseJabama(html: string, url: string, fetchedAt = new Date().toISOString()): EventRecord {
  const identity = eventIdentity("jabama", url);
  if (!identity) throw new Error("Not a Jabama public event URL");
  const page = parsePage(html, url);
  const route = jabamaRoute(page);
  const raw = object(route.event ?? route.theater ?? route.theaterEvent);
  if (String(raw.id ?? "") !== identity.id) throw new Error(`Jabama event payload missing or identity mismatch: ${identity.id}`);
  const theater = identity.kind === "theaters";
  const item = base("jabama", `${theater ? "theater:" : ""}${identity.id}`, identity.url, raw, page, fetchedAt);
  const seo = seoEvent(page);
  const location = object(raw.location), exact = object(location.exact), approximate = object(location.approximate);
  const category = object(raw.category), organizer = object(raw.organizer);
  item.title = str(raw.title) ?? "";
  item.description = plainText(raw.description);
  item.source_categories = [theater ? { code: str(raw.categoryKey) ?? "theater", label: "تئاتر" }
    : { code: str(category.slug) ?? "unknown", label: str(category.label) }];
  item.categories = categorizeEvent(item.source_categories, item.title);
  item.city = str(object(location.city).label) ?? (raw.cityKey === "tehran" ? "تهران" : str(raw.cityKey));
  item.city_code = str(object(location.city).slug ?? raw.cityKey);
  item.address = str(location.address ?? raw.address);
  item.venue = str(location.label ?? raw.venueText);
  item.latitude = num(exact.lat ?? location.lat ?? approximate.centerLat);
  item.longitude = num(exact.lng ?? location.lng ?? approximate.centerLng);
  item.location_precision = item.latitude === null || item.longitude === null ? null : (num(exact.lat ?? location.lat) === null ? "approximate" : "exact");
  item.map_url = item.latitude !== null && item.longitude !== null ? `https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}` : null;
  item.organizer = { name: str(organizer.name ?? organizer.title), url: str(organizer.id) ? canonical("jabama", `/organizers/${organizer.id}`) : null,
    avatar_url: safeHttpUrl(organizer.avatar), raw: raw.organizer ?? null };
  item.sessions = objects(route.sessions ?? route.performances);
  if (!item.sessions.length && Object.keys(object(route.firstSession)).length) item.sessions.push(object(route.firstSession));
  const enabled = item.sessions.filter(session => session.enabled !== false).map(session => iso(session.startIso ?? session.startDate)).filter((value): value is string => !!value).sort();
  item.start_at = enabled[0] ?? iso(seo.startDate);
  // SEO dates are kept separately; availability comes from the public session list.
  item.start_date = tehranDate(item.start_at);
  const sessionEnds = item.sessions.filter(session => session.enabled !== false).map(session => {
    const start = iso(session.startIso ?? session.startDate);
    const minutes = num(session.durationHours) !== null ? Number(session.durationHours) * 60 : num(raw.sessionDurationMinutes);
    return start && minutes !== null ? new Date(Date.parse(start) + minutes * 60000).toISOString() : null;
  }).filter((value): value is string => !!value).sort();
  item.end_at = sessionEnds.at(-1) ?? (enabled.length < 2 ? iso(seo.endDate) : null);
  item.end_date = [tehranDate(item.end_at), tehranDate(enabled.at(-1) ?? null)].filter((value): value is string => !!value).sort().at(-1) ?? null;
  item.start_time = tehranTime(item.start_at); item.end_time = tehranTime(item.end_at);
  item.date_text = str(raw.duration ?? raw.customDate);
  item.schedule_type = str(raw.scheduleType ?? raw.inventoryMode);
  item.duration = str(raw.duration) ?? (num(raw.durationHours) !== null ? `${raw.durationHours} ساعت` : null);
  const fromPrice = object(raw.fromPrice);
  const amount = num(theater ? fromPrice.amount : raw.minPriceAfterDiscount ?? raw.pricePerPerson ?? raw.unitPrice);
  const visibleCurrency = /تومان/.test(page.text) ? "IRT" : /ریال/.test(page.text) ? "IRR" : null;
  item.price = { amount, currency: str(fromPrice.currency) ?? visibleCurrency, text: null, is_free: amount === null ? null : amount === 0,
    raw: { pricePerPerson: raw.pricePerPerson ?? null, unitPrice: raw.unitPrice ?? null, minPriceAfterDiscount: raw.minPriceAfterDiscount ?? null,
      fromPrice: raw.fromPrice ?? null, ticketTiers: raw.ticketTiers ?? null, seo_offers: seo.offers ?? null } };
  const seoCurrency = object(seo.offers).priceCurrency;
  if (seoCurrency && item.price.currency && seoCurrency !== item.price.currency) item.warnings.push(`SEO currency ${seoCurrency} differs from the visible price currency ${item.price.currency}; no conversion applied.`);
  item.status = raw.active === false ? "inactive" : "published";
  item.booking_url = identity.url;
  item.terms = text(raw.termsAndConditions);
  item.reviews = objects(raw.reviews ?? route.reviews);
  const media = object(raw.media);
  const official = objects(media.official), user = objects(media.user);
  item.photos = photos([
    ...[...official, ...user].filter(value => value.type !== "video").map(value => ({ value, role: "event" })),
    ...arr(raw.images ?? raw.gallery).map(value => ({ value, role: "event" })),
    ...[raw.imageUrl, ...arr(seo.image)].filter(Boolean).map(value => ({ value, role: "cover" })),
    ...item.reviews.flatMap(review => arr(review.images).map(value => ({ value, role: "review" }))),
  ]);
  item.videos = [...official, ...user].filter(value => value.type === "video").map(value => safeHttpUrl(value.url)).filter((value): value is string => !!value);
  item.raw_page.route_data = Object.fromEntries(Object.entries(route).filter(([key]) => !["event", "theater", "theaterEvent", "cities"].includes(key)));
  if (!item.title) throw new Error("Jabama event has no title");
  return item;
}

export function davvvatObjects(page: ParsedPage): Data[] {
  const unique = new Map<string, Data>();
  for (const value of walkObjects(page.flight)) {
    if (typeof value.slug !== "string" || !/^[\w-]+\/.+/.test(value.slug) || typeof value.name !== "string" || !("startDate" in value)) continue;
    const previous = unique.get(value.slug);
    if (!previous || Object.keys(value).length > Object.keys(previous).length) unique.set(value.slug, value);
  }
  return [...unique.values()];
}

export function parseDavvvat(html: string, url: string, fetchedAt = new Date().toISOString()): EventRecord {
  const identity = eventIdentity("davvvat", url);
  if (!identity) throw new Error("Not a Davvvat public event URL");
  const page = parsePage(html, url);
  const raw = davvvatObjects(page).find(value => String(value.slug).split("/")[0] === identity.id);
  if (!raw) throw new Error(`Davvvat event payload missing or identity mismatch: ${identity.id}`);
  if (raw.isPrivate === true) throw new Error("Private event excluded");
  const item = base("davvvat", identity.id, identity.url, raw, page, fetchedAt);
  const seo = seoEvent(page);
  item.title = str(raw.name) ?? ""; item.description = plainText(raw.description);
  item.source_categories = [...new Set([...arr(raw.categories), ...arr(raw.types), raw.category, raw.type].filter(value => typeof value === "string" && value))]
    .map(code => ({ code: String(code), label: null }));
  const online = ["online", "virtual"].includes(String(raw.mode));
  item.categories = categorizeEvent(item.source_categories, item.title, online);
  item.city = str(raw.city); item.city_code = item.city === "تهران" ? "tehran" : null; item.area = str(raw.area);
  item.address = str(raw.address); item.venue = str(object(seo.location).name);
  item.latitude = num(raw.latitude); item.longitude = num(raw.longitude);
  item.location_precision = item.latitude !== null && item.longitude !== null ? "exact" : null;
  item.map_url = safeHttpUrl(raw.mapUrl) ?? (item.latitude !== null && item.longitude !== null ? `https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}` : null);
  const organizations = objects(raw.organizations), organizer = organizations[0] ?? {};
  item.organizer = { name: str(organizer.name ?? raw.teacherName), url: str(organizer.slug) ? canonical("davvvat", `/business/${organizer.slug}`) : null,
    avatar_url: safeHttpUrl(organizer.logo), raw: raw.organizations ?? null };
  // These are calendar date anchors, not event instants. Keep the explicit clock fields separate.
  item.start_date = datePart(raw.startDate); item.end_date = datePart(raw.endDate);
  item.start_time = str(raw.startTime); item.end_time = str(raw.endTime);
  item.schedule_type = raw.isWeekly === true ? "weekly" : str(raw.mode);
  item.sessions = objects(raw.calendar);
  if (raw.calendar && !Array.isArray(raw.calendar)) item.raw_page.calendar = raw.calendar;
  const price = object(raw.ticketPrice);
  item.price = { amount: num(price.price ?? price.amount) ?? (price.isFree === true ? 0 : null), currency: str(price.currency),
    text: str(price.priceText), is_free: typeof price.isFree === "boolean" ? price.isFree : null, raw: raw.ticketPrice ?? null };
  item.status = raw.isExpired === true ? "expired" : raw.isSoldOut === true ? "sold_out" : str(raw.status);
  item.booking_url = safeHttpUrl(raw.ticketLink) ?? safeHttpUrl(raw.onlineLink);
  item.tags = arr(raw.tags).map(value => typeof value === "string" ? value : str(object(value).name)).filter((value): value is string => !!value);
  item.photos = photos([{ value: raw.cover, role: "cover" }, ...arr(raw.galleryImgs).map(value => ({ value, role: "gallery" }))]);
  const video = safeHttpUrl(raw.videoUrl); item.videos = video ? [video] : [];
  item.reviews = objects(raw.reviews ?? raw.feedbacks);
  const seoDate = tehranDate(iso(seo.startDate));
  if (seoDate && seoDate !== item.start_date) item.warnings.push("SEO timestamp differs from the event calendar date; source calendar date retained without inferring a start instant.");
  if (!item.title || !item.description) item.warnings.push("Public event did not provide a title or full description.");
  return item;
}

export function parseEvent(source: EventSource, html: string, url: string, fetchedAt?: string): EventRecord {
  return source === "jabama" ? parseJabama(html, url, fetchedAt) : parseDavvvat(html, url, fetchedAt);
}
