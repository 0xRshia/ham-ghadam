import { faContent } from "@/locales/domain-fa";
import { googleMapsUrl, parseGoogleMapsUrl } from "./google-maps";

export const LOCATION_URL_ERROR = faContent.invalidVenueUrl;

export type LocationLink = {
  url: string;
  lat: number | null;
  lng: number | null;
};

export function eventLocationUrl(event: { maps_url: string | null; lat: number | null; lng: number | null }): string | null {
  const stored = parseLocationUrl(event.maps_url);
  if (stored) return stored.url;
  const { lat, lng } = event;
  return lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? googleMapsUrl(lat, lng) : null;
}

/** Validate a destination without fetching it or inferring unknown coordinates. */
export function parseLocationUrl(value: unknown): LocationLink | null {
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return null;
  const input = value.trim();
  const authority = input.match(/^https?:\/\/([^/?#]+)/i)?.[1];
  if (!authority || authority.includes("@") || input.length > 2048 || /[\s\\]/.test(input)) return null;
  let url: URL;
  try { url = new URL(input); } catch { return null; }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname ||
    url.username || url.password || url.href.length > 2048) return null;
  const coordinates = parseGoogleMapsUrl(url.href);
  return { url: url.href, lat: coordinates?.lat ?? null, lng: coordinates?.lng ?? null };
}
