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
