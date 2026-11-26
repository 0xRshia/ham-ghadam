import { eventApp } from "./landing-content";

export type LandingEvent = {
  id: string;
  title: string;
  category: string;
  city: string;
  venue: string;
  poster: string | null;
  startsAt: number | null;
  endsAt: number | null;
  scheduleDate: string;
  scheduleTime: string;
};

// The reference selects these posters first while the events are still public.
const featuredEventIds = [
  "9d11bd86-2f20-466d-81e2-49c90cbb8d07",
  "cf207eab-61b5-4340-ab98-c5e56a7e1bd9",
  "addf0a86-78a4-4759-8c53-49ab3dd0fa1e",
  "4b53d2b3-0a6c-4a10-878a-33a9263943d4",
  "a6fac8b3-b62b-4fbf-8a5a-432606fb74b7",
  "73e8c6e0-8a8e-4514-bd05-085bbd8923ef",
];

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(new Date(value).getTime()) ? value : null;
}

function posterUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, eventApp);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export async function getLandingEvents(): Promise<LandingEvent[]> {
  try {
    const response = await fetch(`${eventApp}/api/events`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return [];
    const { events } = asRecord(await response.json());
    if (!Array.isArray(events)) return [];

    const now = Date.now();
    const tehran = new Map<string, LandingEvent>();
    for (const value of events) {
      const event = asRecord(value);
      const { id, title, category, city, venue } = event;
      const endsAt = asTimestamp(event.ends_at);
      if (typeof id !== "string" || !id || typeof title !== "string" || !title.trim()) continue;
      if (typeof city !== "string" || city.trim() !== "تهران" || (endsAt !== null && endsAt <= now)) continue;
      const schedule = asRecord(event.schedule);
      tehran.set(id, {
        id, title, city: city.trim(), endsAt,
        category: asText(category),
        venue: asText(venue),
        poster: posterUrl(event.thumbnail) ?? posterUrl(event.image),
        startsAt: asTimestamp(event.starts_at),
        scheduleDate: asText(schedule.date_text),
        scheduleTime: asText(schedule.time_text),
      });
    }

    const featured = featuredEventIds.flatMap(id => {
      const event = tehran.get(id);
      tehran.delete(id);
      return event ? [event] : [];
    });
    return [...featured, ...tehran.values()];
  } catch {
    // The public journal and calendar link remain available during catalog outages.
    return [];
  }
}
