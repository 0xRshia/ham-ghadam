import { eventAvailable, eventSortTime, nextScheduleDay } from "./event-schedule";
import { distanceKm, type EventItem, type EventSuggestion } from "./types";
import { visibleSuggestions } from "./recommendations";
import { DISCOVERY_ONLY } from "./product-mode";

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

export function hasEventCoordinates<T extends { lat: number | null; lng: number | null }>(event: T): event is T & { lat: number; lng: number } {
  return event.lat !== null && event.lng !== null && Number.isFinite(event.lat) && Number.isFinite(event.lng) &&
    Math.abs(event.lat) <= 90 && Math.abs(event.lng) <= 180;
}

export function filterEvents(events: EventItem[], filters: CatalogFilters, now: number) {
  const { point, city, category, free, when, query, sort } = filters;
  const normalize = (value: string) => value.replace(/ي/g, "ی").replace(/ك/g, "ک");
  return events.map((event) => ({
    ...event,
    distance: point && hasEventCoordinates(event)
      ? distanceKm(point.lat, point.lng, event.lat, event.lng) : undefined,
  })).filter((event) =>
    eventAvailable(event, now) &&
    (city === "all" || (city === "nearby" ? (event.distance ?? Infinity) < 50 : event.city === city)) &&
    (category === "all" || event.category === category) &&
    (DISCOVERY_ONLY || !free || (event.minimum_price ?? event.price) === 0) &&
    (when === "all" || (nextScheduleDay(event, now) !== null && eventSortTime(event, now) < now + (when === "week" ? 7 : 1) * 86400000)) &&
    normalize(`${event.title} ${event.venue} ${event.address}`).includes(normalize(query.trim())),
  ).sort((a, b) => {
    const tie = eventSortTime(a, now) - eventSortTime(b, now) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (sort === "distance") {
      if (a.distance === undefined) return b.distance === undefined ? tie : 1;
      if (b.distance === undefined) return -1;
      return a.distance - b.distance || tie;
    }
    return !DISCOVERY_ONLY && sort === "price" ? (a.minimum_price ?? a.price) - (b.minimum_price ?? b.price) || tie : tie;
  });
}

export function groupEvents(events: EventItem[], suggestions: EventSuggestion[], now: number, sort = "soon") {
  const entries = (items: EventItem[]): CatalogEntry[] => items.map((event) => ({ event }));
  let orderedSuggestions = suggestions;
  if (sort === "distance") {
    // Rank every candidate before visibleSuggestions applies its preview limit.
    const positions = new Map(events.map((event, index) => [event.id, index]));
    orderedSuggestions = [...suggestions].sort((a, b) =>
      (positions.get(a.eventId) ?? Infinity) - (positions.get(b.eventId) ?? Infinity));
  }
  const suggested = visibleSuggestions(events.filter((event) => (DISCOVERY_ONLY && event.schedule) ? eventAvailable(event, now) : event.registration_ends_at > now &&
    (event.remaining === null || event.remaining > 0)), orderedSuggestions);
  return {
    free: entries(events.filter((event) => (event.minimum_price ?? event.price) === 0)),
    suggested,
    new: entries(events.filter((event) => event.created_at !== null).sort((a, b) =>
      b.created_at! - a.created_at! || eventSortTime(a, now) - eventSortTime(b, now) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )),
    all: entries(events),
  };
}
