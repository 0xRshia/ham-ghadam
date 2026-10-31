import type { CategoryOption } from "../viewer-data.js";
import { normalizeSearch, safeHttpUrl } from "../viewer-data.js";
import { EVENT_CATEGORY_LABELS, SOURCE_LABELS, type EventRecord, type EventSource } from "./model.js";

export interface EventCard {
  event_id: string; source: EventSource; title: string; categories: string[]; city: string | null; area: string | null;
  address: string | null; start_date: string | null; end_date: string | null; start_time: string | null; end_time: string | null;
  date_text: string | null; price: EventRecord["price"]; cover_url: string | null; photo_count: number; status: string | null; online: boolean;
}
export interface EventMeta {
  total: number; categories: CategoryOption[]; sources: { code: EventSource; label: string; count: number }[];
  cities: { label: string; count: number }[]; captured_at: string | null; reports: unknown;
}
export interface EventResults { items: EventCard[]; total: number; page: number; pages: number; limit: number }

export function buildEventCatalogue(events: EventRecord[], report: { exported_at?: string; reports?: unknown } = {}) {
  const categories = new Map<string, number>(), cities = new Map<string, number>();
  const entries = events.map(event => {
    const codes = [...new Set(event.categories.map(category => category.code))];
    for (const code of codes) categories.set(code, (categories.get(code) ?? 0) + 1);
    if (event.city) cities.set(event.city, (cities.get(event.city) ?? 0) + 1);
    const photos = event.photos.filter(photo => safeHttpUrl(photo.url));
    const card: EventCard = { event_id: event.event_id, source: event.source, title: event.title, categories: codes,
      city: event.city, area: event.area, address: event.address, start_date: event.start_date, end_date: event.end_date,
      start_time: event.start_time, end_time: event.end_time, date_text: event.date_text, price: event.price,
      cover_url: safeHttpUrl(photos[0]?.thumbnail_url) ?? safeHttpUrl(photos[0]?.url), photo_count: photos.length,
      status: event.status, online: codes.includes("online") };
    const search = normalizeSearch([event.title, event.description, event.city, event.area, event.address, event.venue,
      event.organizer.name, event.source_id, SOURCE_LABELS[event.source], ...event.tags, ...event.categories.map(category => category.label),
      ...event.source_categories.flatMap(category => [category.code, category.label])].filter(Boolean).join(" "));
    return { card, search };
  });
  const meta: EventMeta = { total: events.length, captured_at: report.exported_at ?? null, reports: report.reports ?? null,
    categories: Object.entries(EVENT_CATEGORY_LABELS).filter(([code]) => categories.has(code)).map(([code, label]) => ({ code, label, count: categories.get(code)! })),
    sources: (["jabama", "davvvat"] as EventSource[]).map(code => ({ code, label: SOURCE_LABELS[code], count: events.filter(event => event.source === code).length })),
    cities: [...cities].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
  };
  return { entries, byId: new Map(events.map(event => [event.event_id, event])), meta };
}

function todayInTehran() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
export function searchEvents(catalogue: ReturnType<typeof buildEventCatalogue>, params: URLSearchParams): EventResults {
  const tokens = normalizeSearch((params.get("q") ?? "").slice(0, 300)).split(" ").filter(Boolean);
  const source = params.get("source") ?? "", category = params.get("category") ?? "", city = params.get("city") ?? "";
  const sort = params.get("sort") ?? "date", period = params.get("period") ?? "all";
  if ((source && !["jabama", "davvvat"].includes(source)) || (category && !catalogue.meta.categories.some(item => item.code === category))
    || (city && !catalogue.meta.cities.some(item => item.label === city)) || !["date", "name", "photos"].includes(sort) || !["all", "upcoming", "past"].includes(period)) throw new Error("فیلتر رویداد معتبر نیست.");
  const pageNumber = Number(params.get("page") ?? 1), limit = Number(params.get("limit") ?? 36);
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 60) throw new Error("شماره یا اندازه صفحه معتبر نیست.");
  const today = todayInTehran();
  const matches = catalogue.entries.filter(({ card, search }) => (!source || source === card.source)
    && (!category || card.categories.includes(category)) && (!city || city === card.city)
    && (params.get("free") !== "1" || card.price.is_free === true) && (params.get("online") !== "1" || card.online)
    && (params.get("photos") !== "1" || card.photo_count > 0)
    && (period === "all" || (period === "upcoming" ? !!(card.end_date ?? card.start_date) && (card.end_date ?? card.start_date)! >= today
      && !["expired", "inactive"].includes(card.status ?? "") : !!(card.end_date ?? card.start_date) && (card.end_date ?? card.start_date)! < today))
    && tokens.every(token => search.includes(token) || search.replaceAll(" ", "").includes(token.replaceAll(" ", ""))));
  const key = (card: EventCard) => {
    if (!card.start_date) return "2";
    const ongoing = (card.end_date ?? card.start_date) >= today && !["expired", "inactive"].includes(card.status ?? "");
    return ongoing ? `0${card.start_date < today ? today : card.start_date}` : `1${String(99999999 - Number(card.start_date.replaceAll("-", ""))).padStart(8, "0")}`;
  };
  matches.sort((a, b) => (sort === "date" ? key(a.card).localeCompare(key(b.card)) : sort === "photos" ? b.card.photo_count - a.card.photo_count : 0)
    || a.card.title.localeCompare(b.card.title, "fa") || a.card.event_id.localeCompare(b.card.event_id));
  const pages = Math.max(1, Math.ceil(matches.length / limit)), page = Math.min(pageNumber, pages);
  return { items: matches.slice((page - 1) * limit, page * limit).map(entry => entry.card), total: matches.length, page, pages, limit };
}
