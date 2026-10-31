import { ApiError } from "@/lib/server";
import { categories, digits, type EventItem } from "@/lib/types";
import { parsePersianDate, persianInput } from "@/lib/persian-date";
import { validRegistrationDeadline } from "@/lib/registration";
import { LOCATION_URL_ERROR, parseLocationUrl } from "@/lib/location-url";
import { faContent } from "@/locales/domain-fa";
import { readOriginalPrice } from "@/lib/discount";
import { copy } from "@/locales/fa";
import { normalizeEventTeaser, normalizeInstagramTeaser } from "@/lib/event-teaser";
import { eventTeaserCopy } from "@/locales/event-teaser-fa";
import { EVENT_COORDINATES_ERROR, parseEventCoordinates } from "@/lib/event-coordinates";
import { manualScheduleEnd, parseManualSchedule } from "./manual-event-schedule";
import { nextManualSession, type FlexibleSchedule } from "./event-schedule";

export function readEventTeaser(data: Record<string, unknown>, previous?: EventItem) {
  if (data.teaser === undefined && data.teaser_url === undefined) return previous?.teaser_url ?? previous?.teaser ?? null;
  const teaser = data.teaser === undefined ? undefined : normalizeEventTeaser(data.teaser);
  const instagram = data.teaser_url === undefined ? undefined : normalizeInstagramTeaser(data.teaser_url);
  if (data.teaser !== undefined && teaser === undefined) throw new ApiError(400, eventTeaserCopy.invalid);
  if (data.teaser_url !== undefined && instagram === undefined) throw new ApiError(400, eventTeaserCopy.invalidInstagram);
  // Both published request names address one stored link; never silently pick
  // a winner when an older client sends conflicting aliases.
  if (data.teaser !== undefined && data.teaser_url !== undefined && teaser !== instagram) {
    throw new ApiError(400, eventTeaserCopy.conflictingFields);
  }
  return (data.teaser === undefined ? instagram : teaser) ?? null;
}

export function readEventInput(data: Record<string, unknown>, previous?: EventItem) {
  const labels: Record<string, string> = {
    title: "عنوان رویداد", description: "توضیحات رویداد", venue: "محل برگزاری", address: "نشانی",
    city: "شهر", category: "دسته‌بندی", date: "تاریخ شروع", time: "ساعت شروع",
    endDate: "تاریخ پایان", endTime: "ساعت پایان", registrationDate: "تاریخ مهلت ثبت‌نام", registrationTime: "ساعت مهلت ثبت‌نام",
  };
  function field(key: string, max: number, required = true) {
    const value = data[key];
    if (!required && (value === undefined || value === null)) return "";
    if (typeof value !== "string" || (required && !value.trim())) throw new ApiError(400, `فیلد «${labels[key]}» را تکمیل کنید.`);
    if (value.length > max) throw new ApiError(400, `فیلد «${labels[key]}» باید حداکثر ${max.toLocaleString("fa-IR")} نویسه باشد.`);
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
  const now = Date.now();
  let schedule: FlexibleSchedule | null;
  try { schedule = data.schedule === undefined ? previous?.schedule ?? null : data.schedule === null ? null : parseManualSchedule(data.schedule); }
  catch (error) { throw new ApiError(400, (error as Error).message); }
  // Multi-session and recurring events have no single continuous start/end.
  const start = schedule ? null : timestamp(field("date", 10), field("time", 5), previous?.starts_at);
  const end = schedule ? null : timestamp(data.endDate === undefined ? field("date", 10) : field("endDate", 10), field("endTime", 5), previous?.ends_at);
  const scheduleChanged = !previous || previous.starts_at !== start || previous.ends_at !== end || JSON.stringify(previous.schedule ?? null) !== JSON.stringify(schedule);
  if (schedule && scheduleChanged) {
    const next = nextManualSession(schedule, now);
    const first = schedule.range_start ?? schedule.dates[0];
    if (!next || next.start > now + 730 * 86400000 || first > now + 730 * 86400000 || (!previous && nextManualSession(schedule, first - 1)!.start <= now))
      throw new ApiError(400, "زمان‌بندی باید یک سانس آینده در دو سال پیش رو داشته باشد؛ شروع رویداد تازه نیز باید در آینده باشد.");
  }
  if (start !== null && end !== null) {
    if (!Number.isFinite(start)) throw new ApiError(400, "تاریخ یا ساعت شروع معتبر نیست. تاریخ شمسی و ساعت شروع را بررسی کنید.");
    if (!Number.isFinite(end)) throw new ApiError(400, "تاریخ یا ساعت پایان معتبر نیست. تاریخ شمسی و ساعت پایان را بررسی کنید.");
    if (end <= start) throw new ApiError(400, "زمان پایان باید بعد از شروع باشد. برای رویداد شبانه، تاریخ پایان را روز بعد انتخاب کنید.");
    if (scheduleChanged && (start <= now || start > now + 730 * 86400000))
      throw new ApiError(400, "زمان شروع رویداد باید در آینده و حداکثر تا دو سال دیگر باشد.");
    if (scheduleChanged && data.endDate !== undefined && (start % 300000 !== 0 || end % 300000 !== 0))
      throw new ApiError(400, "دقیقهٔ شروع و پایان باید مضرب پنج باشد؛ برای نمونه ۱۸:۰۰ یا ۱۸:۰۵.");
  }
  const registrationDate = field("registrationDate", 10, false);
  const registrationTime = field("registrationTime", 5, false);
  // Omitted fields preserve an existing deadline; two empty fields explicitly clear it.
  const registrationEnd = data.registrationDate === undefined && data.registrationTime === undefined
    ? previous?.registration_ends_at ?? null
    : !registrationDate && !registrationTime ? null
      : timestamp(registrationDate, registrationTime, previous?.registration_ends_at);
  const deadlineLimit = schedule ? manualScheduleEnd(schedule) : end;
  if (registrationEnd !== null && (deadlineLimit === null || ((!previous || registrationEnd !== previous.registration_ends_at)
      ? !validRegistrationDeadline(registrationEnd, deadlineLimit, now)
      : !Number.isFinite(registrationEnd) || registrationEnd > deadlineLimit)))
    throw new ApiError(400, faContent.registrationDeadlineInvalid);
  const retainedLocation = previous && (data.maps_url ?? null) === previous.maps_url;
  let location = retainedLocation ? { url: previous.maps_url, lat: previous.lat, lng: previous.lng } : parseLocationUrl(data.maps_url);
  if (!location) throw new ApiError(400, LOCATION_URL_ERROR);
  if (data.lat !== undefined || data.lng !== undefined) {
    const coordinates = parseEventCoordinates(data.lat, data.lng);
    if (coordinates === undefined) throw new ApiError(400, EVENT_COORDINATES_ERROR);
    // An explicit empty pair restores URL extraction; omission preserves legacy edits.
    const point = coordinates ?? parseLocationUrl(data.maps_url) ?? { lat: null, lng: null };
    location = { ...location, lat: point.lat, lng: point.lng };
  }
  function numberField(value: unknown) {
    return typeof value === "number" || (typeof value === "string" && value.trim()) ? Number(value) : NaN;
  }
  // Price is no longer an authoring field. Preserve historic amounts on edits.
  const price = data.price === undefined ? previous?.price ?? 0 : numberField(data.price);
  const capacity = data.capacity === "" || data.capacity == null ? null : numberField(data.capacity);
  if (!Number.isInteger(price) || price < 0 || (price > 0 && price < 1000) || price > 100000000)
    throw new ApiError(400, "قیمت باید صفر یا یک عدد صحیح بین ۱٬۰۰۰ و ۱۰۰٬۰۰۰٬۰۰۰ تومان باشد.");
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000))
    throw new ApiError(400, "ظرفیت باید یک عدد صحیح بین ۱ و ۱۰۰٬۰۰۰ باشد؛ برای ظرفیت نامحدود آن را خالی بگذارید.");
  if (!categories.some(item => item.id === category && item.id !== "all"))
    throw new ApiError(400, "دسته‌بندی رویداد معتبر نیست. یکی از دسته‌های فهرست را انتخاب کنید.");
  const originalPrice = readOriginalPrice(data.original_price === undefined ? previous?.original_price : data.original_price, price);
  if (originalPrice === undefined) throw new ApiError(400, copy.originalPriceInvalid);
  return { title, description, venue, address, city, category, start, end, schedule, registrationEnd, location, price, originalPrice, capacity };
}
