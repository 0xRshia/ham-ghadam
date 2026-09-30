import { faContent } from "@/locales/domain-fa";
import type { Organizer } from "./community-types";
export type EventItem = {
  id: string;
  host_id: string;
  title: string;
  description: string;
  category: string;
  venue: string;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  maps_url: string | null;
  starts_at: number;
  ends_at: number;
  registration_ends_at: number;
  price: number;
  minimum_price?: number;
  capacity: number | null;
  image: string | null;
  thumbnail: string | null;
  published: number;
  sample: number;
  created_at: number | null;
  remaining: number | null;
  attendees: number;
  distance?: number;
  rating_count?: number;
  rating_average?: number | null;
};
export type TicketTier = { id: string; event_id: string; name: string; description: string; price: number; capacity: number | null; remaining: number | null; active: number; position: number };
export type TicketSelection = { tierId: string; quantity: number };
export type AgendaItem = { id: string; title: string; speaker: string; image_url: string | null; starts_at: number; ends_at: number };
export type EventProgram = { video_url: string | null; series_id: string | null; agenda: AgendaItem[]; revision: number };
export type EventEdition = Pick<EventItem, "id" | "title" | "starts_at" | "ends_at" | "registration_ends_at" | "remaining" | "price" | "minimum_price">;
export type EventDetailData = EventItem & {
  program?: EventProgram;
  editions?: EventEdition[];
  ticketTiers?: TicketTier[];
  organizer?: Organizer | null;
  gallery: { id: string; url: string }[];
  serverNow?: number;
};
export type EventSuggestion = {
  eventId: string;
  reason: "category" | "popular" | "latest" | null;
};
export type EventCatalog = {
  events: EventItem[];
  suggestions: EventSuggestion[];
  serverNow?: number;
};
export type User = { id: string; phone: string; name: string; isHost: boolean; isAdmin: boolean };
// TODO(PRODUCTION): REMOVE_TEMP_LOGIN — remove the immediate-user response when retiring demo login.
export type AuthRequestResponse =
  | { user: User }
  | { challengeId: string; resendAfter: number; expiresIn: number; serverNow: number; expiresAt: number; resendAt: number };
export type Reservation = {
  category?: string;
  ticket_items?: { name: string; quantity: number }[];
  id: string;
  event_id: string;
  quantity: number;
  total: number;
  status: string;
  created_at: number;
  expires_at: number | null;
  reference: string | null;
  payment_state: string;
  title: string;
  venue: string;
  maps_url: string | null;
  lat: number | null;
  lng: number | null;
  image: string | null;
  starts_at: number;
  ends_at: number;
  phone?: string;
  name?: string;
};
export const categories = [
  { id: "all", label: faContent.allEventsLegacy },
  { id: "music", label: faContent.music },
  { id: "art", label: faContent.art },
  { id: "books", label: faContent.books },
  { id: "games", label: faContent.games },
  { id: "coffee", label: faContent.coffee },
];
export const fa = (n: number) => new Intl.NumberFormat("fa-IR").format(n);
export const faDigits = (value: string | number) =>
  String(value).replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
export const date = (time: number, full = false) =>
  new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "Asia/Tehran",
    day: "numeric",
    month: "long",
    ...(full
      ? { year: "numeric" as const, weekday: "long" as const }
      : { weekday: "short" as const }),
  }).format(time);
export const clock = (time: number) =>
  new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
  }).format(time);
export const digits = (s: string) =>
  s.replace(/[۰-۹٠-٩]/g, (c) =>
    String(
      "۰۱۲۳۴۵۶۷۸۹".includes(c)
        ? "۰۱۲۳۴۵۶۷۸۹".indexOf(c)
        : "٠١٢٣٤٥٦٧٨٩".indexOf(c),
    ),
  );
export function distanceKm(lat: number, lng: number, a: number, b: number) {
  const r = Math.PI / 180;
  const x =
    Math.sin(((a - lat) * r) / 2) ** 2 +
    Math.cos(lat * r) * Math.cos(a * r) * Math.sin(((b - lng) * r) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
