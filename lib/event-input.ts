import { ApiError } from "@/lib/server";
import { categories, digits, type EventItem } from "@/lib/types";
import { parsePersianDate, persianInput } from "@/lib/persian-date";
import { validRegistrationDeadline } from "@/lib/registration";
import { LOCATION_URL_ERROR, parseLocationUrl } from "@/lib/location-url";
import { faContent } from "@/locales/domain-fa";
import { readOriginalPrice } from "@/lib/discount";
import { copy } from "@/locales/fa";
import { normalizeEventTeaser } from "@/lib/event-teaser";
import { eventTeaserCopy } from "@/locales/event-teaser-fa";

export function readEventTeaser(data: Record<string, unknown>, previous?: EventItem) {
  const teaser = normalizeEventTeaser(data.teaser === undefined ? previous?.teaser : data.teaser);
  if (teaser === undefined) throw new ApiError(400, eventTeaserCopy.invalid);
  return teaser;
}

export function readEventInput(data: Record<string, unknown>, previous?: EventItem) {
  function field(key: string, max: number, required = true) {
    const value = data[key];
    if (!required && (value === undefined || value === null)) return "";
    if (typeof value !== "string" || (required && !value.trim())) throw new ApiError(400, faContent.requiredFields);
    if (value.length > max) throw new ApiError(400, faContent.textTooLong);
    return value.trim();
  }
  const title = field("title", 120), description = field("description", 4000),
    venue = field("venue", 120), address = field("address", 300, false),
    city = field("city", 80), category = field("category", 40);
  function timestamp(date: string, time: string, existing?: number | null) {
    const parsed = parsePersianDate(date, time);
    if (existing != null) {
      const existingTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(existing);
      // Legacy timestamps can include seconds, or a zero registration deadline.
      // A minute-resolution form must preserve their exact unchanged value.
      if (parsed === Math.floor(existing / 60000) * 60000 ||
          (digits(date).replaceAll("-", "/") === persianInput(existing) && digits(time) === existingTime)) return existing;
    }
    return parsed;
  }
  const start = timestamp(field("date", 10), field("time", 5), previous?.starts_at);
  const end = timestamp(data.endDate === undefined ? field("date", 10) : field("endDate", 10), field("endTime", 5), previous?.ends_at);
  const now = Date.now();
  const scheduleChanged = !previous || previous.starts_at !== start || previous.ends_at !== end;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start ||
      (scheduleChanged && (start <= now || start > now + 730 * 86400000)) ||
      (scheduleChanged && data.endDate !== undefined && (start % 300000 !== 0 || end % 300000 !== 0)))
    throw new ApiError(400, faContent.eventDateInvalid);
  const registrationDate = field("registrationDate", 10, false);
  const registrationTime = field("registrationTime", 5, false);
  // Omitted fields preserve an existing deadline; two empty fields explicitly clear it.
  const registrationEnd = data.registrationDate === undefined && data.registrationTime === undefined
    ? previous?.registration_ends_at ?? null
    : !registrationDate && !registrationTime ? null
      : timestamp(registrationDate, registrationTime, previous?.registration_ends_at);
  if (registrationEnd !== null && ((!previous || registrationEnd !== previous.registration_ends_at)
      ? !validRegistrationDeadline(registrationEnd, end, now)
      : !Number.isFinite(registrationEnd) || registrationEnd > end))
    throw new ApiError(400, faContent.registrationDeadlineInvalid);
  const retainedLocation = previous && (data.maps_url ?? null) === previous.maps_url;
  const location = retainedLocation ? { url: previous.maps_url, lat: previous.lat, lng: previous.lng } : parseLocationUrl(data.maps_url);
  if (!location) throw new ApiError(400, LOCATION_URL_ERROR);
  function numberField(value: unknown) {
    return typeof value === "number" || (typeof value === "string" && value.trim()) ? Number(value) : NaN;
  }
  // Price is no longer an authoring field. Preserve historic amounts on edits.
  const price = data.price === undefined ? previous?.price ?? 0 : numberField(data.price);
  const capacity = data.capacity === "" || data.capacity == null ? null : numberField(data.capacity);
  if (!Number.isInteger(price) || price < 0 || (price > 0 && price < 1000) || price > 100000000 ||
      (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000)) ||
      !categories.some(item => item.id === category && item.id !== "all"))
    throw new ApiError(400, faContent.invalidPriceCapacityCategory);
  const originalPrice = readOriginalPrice(data.original_price === undefined ? previous?.original_price : data.original_price, price);
  if (originalPrice === undefined) throw new ApiError(400, copy.originalPriceInvalid);
  return { title, description, venue, address, city, category, start, end, registrationEnd, location, price, originalPrice, capacity };
}
