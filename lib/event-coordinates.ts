import { digits } from "@/lib/types";

export const EVENT_COORDINATES_ERROR = "عرض و طول جغرافیایی را با هم وارد کنید؛ عرض باید بین ۹۰- و ۹۰ و طول بین ۱۸۰- و ۱۸۰ باشد.";

/** Null means no explicit point; undefined means an invalid or incomplete pair. */
export function parseEventCoordinates(lat: unknown, lng: unknown): { lat: number; lng: number } | null | undefined {
  const empty = (value: unknown) => value == null || (typeof value === "string" && !value.trim());
  if (empty(lat) && empty(lng)) return null;
  function coordinate(value: unknown, limit: number) {
    if (typeof value === "string") {
      const normalized = digits(value.trim()).replaceAll("٫", ".");
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return undefined;
      value = Number(normalized);
    }
    return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit ? value : undefined;
  }
  const latitude = coordinate(lat, 90), longitude = coordinate(lng, 180);
  return latitude === undefined || longitude === undefined ? undefined : { lat: latitude, lng: longitude };
}

export const EVENT_COORDINATE_INPUT_ERROR = "مختصات را به‌شکل «عرض, طول» وارد کنید، مثل 35.7219, 51.3347؛ عرض باید بین ۹۰- و ۹۰ و طول بین ۱۸۰- و ۱۸۰ باشد.";

/** Formats stored coordinates for the single "lat, lng" input; an incomplete legacy pair keeps its known half. */
export function formatEventCoordinates(lat: number | null | undefined, lng: number | null | undefined) {
  return lat == null && lng == null ? "" : `${lat ?? ""}, ${lng ?? ""}`;
}

/**
 * Splits "lat, lng" (Google Maps copy order) into the API's separate fields.
 * Anything other than exactly two parts keeps the raw text in `lat` so parseEventCoordinates rejects it.
 */
export function splitEventCoordinates(value: string) {
  if (!value.trim()) return { lat: "", lng: "" };
  const parts = value.split(/[,،]/);
  return parts.length === 2 ? { lat: parts[0].trim(), lng: parts[1].trim() } : { lat: value, lng: "" };
}
