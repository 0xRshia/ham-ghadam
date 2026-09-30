import type { EventItem, EventSuggestion } from "./types";

export type ConfirmedEventHistory = {
  event_id: string;
  category: string;
  last_booked_at: number;
};
export type EventTicketSales = { event_id: string; tickets: number };

export function rankSuggestions(
  events: EventItem[],
  history: ConfirmedEventHistory[],
  sales: EventTicketSales[],
  now: number,
): EventSuggestion[] {
  const booked = new Set(history.map((item) => item.event_id));
  const interests = new Map<string, { count: number; recent: number }>();
  for (const item of history) {
    const previous = interests.get(item.category);
    interests.set(item.category, {
      count: (previous?.count ?? 0) + 1,
      recent: Math.max(previous?.recent ?? 0, item.last_booked_at),
    });
  }
  const tickets = new Map(sales.map((item) => [item.event_id, item.tickets]));
  return events
    .filter(
      (event) =>
        event.published === 1 &&
        event.starts_at > now &&
        event.registration_ends_at > now &&
        (event.remaining === null || event.remaining > 0) &&
        !booked.has(event.id),
    )
    .sort((a, b) => {
      const first = interests.get(a.category);
      const second = interests.get(b.category);
      return (
        (second?.count ?? 0) - (first?.count ?? 0) ||
        (second?.recent ?? 0) - (first?.recent ?? 0) ||
        (tickets.get(b.id) ?? 0) - (tickets.get(a.id) ?? 0) ||
        // Legacy creation dates are unknown, so they rank after dated entries.
        (b.created_at ?? 0) - (a.created_at ?? 0) ||
        a.starts_at - b.starts_at ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      );
    })
    .map((event) => ({
      eventId: event.id,
      reason: interests.has(event.category)
        ? "category"
        : (tickets.get(event.id) ?? 0) > 0
          ? "popular"
          : event.created_at !== null
            ? "latest"
            : null,
    }));
}

export function visibleSuggestions(
  filteredEvents: EventItem[],
  suggestions: EventSuggestion[],
) {
  const events = new Map(filteredEvents.map((event) => [event.id, event]));
  // Filter before limiting; location stays in the browser, including coordinates.
  return suggestions
    .flatMap((suggestion) => {
      const event = events.get(suggestion.eventId);
      return event ? [{ event, reason: suggestion.reason }] : [];
    })
    .slice(0, 8);
}
