import { distanceKm, type EventItem, type EventSuggestion } from "./types";
import { visibleSuggestions } from "./recommendations";

export const EVENT_PREVIEW_LIMIT = 8;
export type CatalogView = "home" | "all" | "free" | "suggested" | "new";
export type CatalogFilters = {
  category: string;
  query: string;
  city: string;
  sort: string;
  when: string;
  free: boolean;
  point: { lat: number; lng: number; label: string } | null;
  area: string;
};
export const defaultCatalogFilters: CatalogFilters = {
  category: "all", query: "", city: "all", sort: "soon", when: "all",
  free: false, point: null, area: "all",
};
export type CatalogEntry = { event: EventItem; reason?: EventSuggestion["reason"] };

export function compareEventDistance(a: EventItem, b: EventItem) {
  const tie = a.starts_at - b.starts_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (a.distance === undefined) return b.distance === undefined ? tie : 1;
  if (b.distance === undefined) return -1;
  return a.distance - b.distance || tie;
}

export function filterEvents(events: EventItem[], filters: CatalogFilters, now: number) {
  const { point, city, category, free, when, query, sort } = filters;
  const normalize = (value: string) => value.replace(/ي/g, "ی").replace(/ك/g, "ک");
  return events.map((event) => ({
    ...event,
    distance: point && event.lat !== null && event.lng !== null &&
      Number.isFinite(event.lat) && Number.isFinite(event.lng)
      ? distanceKm(point.lat, point.lng, event.lat, event.lng) : undefined,
  })).filter((event) =>
    event.starts_at > now &&
    (city === "all" || (city === "nearby" ? (event.distance ?? Infinity) < 50 : event.city === city)) &&
    (category === "all" || event.category === category) &&
    (!free || (event.minimum_price ?? event.price) === 0) &&
    (when === "all" || event.starts_at < now + (when === "week" ? 7 : 1) * 86400000) &&
    normalize(`${event.title} ${event.venue} ${event.address}`).includes(normalize(query.trim())),
  ).sort((a, b) => {
    const tie = a.starts_at - b.starts_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (sort === "distance") return compareEventDistance(a, b);
    return sort === "price" ? (a.minimum_price ?? a.price) - (b.minimum_price ?? b.price) || tie : tie;
  });
}

export function groupEvents(events: EventItem[], suggestions: EventSuggestion[], now: number, nearestFirst = false) {
  const entries = (items: EventItem[]): CatalogEntry[] => items.map((event) => ({ event }));
  return {
    free: entries(events.filter((event) => (event.minimum_price ?? event.price) === 0)),
    suggested: visibleSuggestions(events.filter((event) => event.registration_ends_at > now &&
      (event.remaining === null || event.remaining > 0)), suggestions, nearestFirst ? compareEventDistance : undefined),
    new: entries(events.filter((event) => event.created_at !== null).sort((a, b) =>
      b.created_at! - a.created_at! || a.starts_at - b.starts_at ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )),
    all: entries(events),
  };
}

export function homeEventSections(events: EventItem[], suggestions: EventSuggestion[], now: number, nearestFirst: boolean) {
  return {
    upcoming: [...events].sort(nearestFirst ? compareEventDistance : (a, b) => a.starts_at - b.starts_at),
    popular: [...events].sort(nearestFirst ? compareEventDistance : (a, b) => b.attendees - a.attendees || a.starts_at - b.starts_at),
    suggested: groupEvents(events, suggestions, now, nearestFirst).suggested,
  };
}
