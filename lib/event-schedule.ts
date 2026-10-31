import { digits, date, clock } from "./types";
import { parsePersianDate } from "./persian-date";

const DAY = 86400000;
const OFFSET = 210 * 60000;
const months = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const weekdayNames = ["یکشنبه", "دوشنبه", "سهشنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
export type ScheduleSession = { weekdays: number[]; start: number | null; end: number | null };
export type FlexibleSchedule = {
  kind: "flexible";
  source?: "manual";
  date_text: string;
  time_text: string;
  year: number;
  dates: number[];
  range_start: number | null;
  range_end: number | null;
  weekdays: number[];
  excluded_weekdays: number[];
  sessions: ScheduleSession[];
};
export type ScheduledEvent = { starts_at: number | null; ends_at: number | null; schedule?: FlexibleSchedule | null };

function normalized(value: string) {
  return digits(value).replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\u200c\u200d]/g, "").replace(/سه\s+شنبه/g, "سهشنبه").replace(/پنج\s+شنبه/g, "پنجشنبه").replace(/یک\s+شنبه/g, "یکشنبه").replace(/چهار\s+شنبه/g, "چهارشنبه").trim();
}
function weekdaysIn(value: string) {
  // Match longer weekday names first so شنبه does not match inside دوشنبه.
  const names = [...weekdayNames].sort((a, b) => b.length - a.length);
  return [...new Set([...value.matchAll(new RegExp(names.join("|"), "g"))].map(match => weekdayNames.indexOf(match[0])))];
}
function minute(value: string) {
  const match = /^(\d{1,2})(?::(\d{2}))?(?:\s*و\s*نیم)?\s*(صبح|شب|عصر|ظهر)?$/.exec(value.trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const minutes = /و\s*نیم/.test(value) ? 30 : Number(match[2] ?? 0);
  if (hour > 23 || minutes > 59) return null;
  if (["شب", "عصر"].includes(match[3]) && hour < 12) hour += 12;
  if (match[3] === "صبح" && hour === 12) hour = 0;
  return hour * 60 + minutes;
}

/** Preserve source text even when only part of a human-written schedule is known. */
export function parseSheetSchedule(dateText: string, timeText: string, year: number): FlexibleSchedule {
  const value = normalized(dateText);
  const schedule: FlexibleSchedule = { kind: "flexible", date_text: dateText.trim(), time_text: timeText.trim(), year, dates: [], range_start: null, range_end: null, weekdays: [], excluded_weekdays: [], sessions: [] };
  const monthPattern = months.join("|");
  const numeric = /^(14\d{2})[/-](\d{1,2})[/-](\d{1,2})(?:\s|$)/.exec(value);
  if (numeric) {
    const day = parsePersianDate(`${numeric[1]}/${numeric[2]}/${numeric[3]}`, "00:00");
    if (Number.isFinite(day)) schedule.dates = [day];
  } else {
    const match = new RegExp(`^(تا\\s+)?(\\d{1,2})(?:\\s*(تا|الی|و|-)\\s*(\\d{1,2}))?\\s*(${monthPattern})(?:\\s+(14\\d{2}))?(?:\\s|$)`).exec(value);
    if (match) {
      const month = months.indexOf(match[5]) + 1;
      const sourceYear = Number(match[6] ?? year);
      const first = parsePersianDate(`${sourceYear}/${month}/${match[2]}`, "00:00");
      const last = match[4] ? parsePersianDate(`${sourceYear}/${month}/${match[4]}`, "00:00") : first;
      if (Number.isFinite(first) && Number.isFinite(last) && last >= first) {
        if (match[1]) schedule.range_end = last;
        else if (match[3] === "و") schedule.dates = [...new Set([first, last])];
        else if (match[4]) { schedule.range_start = first; schedule.range_end = last; }
        else schedule.dates = [first];
      }
    }
  }
  const combined = `${value}\n${normalized(timeText)}`;
  const exclusions = /(?:به جز|تعطیل\s*[:：])([^\n)]+)/.exec(combined);
  if (exclusions) schedule.excluded_weekdays = weekdaysIn(exclusions[1]);
  if (!schedule.dates.length && schedule.range_end === null) schedule.weekdays = weekdaysIn(value);
  const timeValue = normalized(timeText).replace(/ساعت(?:های)?\s*کار\s*[:：]?|ساعات\s*کار\s*[:：]?|ساعات|ساعت/g, " ");
  const token = "\\d{1,2}(?::\\d{2})?(?:\\s*و\\s*نیم)?(?:\\s*(?:صبح|شب|عصر|ظهر))?";
  for (const line of timeValue.split(/\n/)) {
    if (/تعطیل|به جز/.test(line)) continue;
    const windows = [...line.matchAll(new RegExp(`(${token})\\s*(?:تا|الی|[-–—])\\s*(${token})`, "g"))];
    for (const [index, window] of windows.entries()) {
      let start = minute(window[1]);
      const end = minute(window[2]);
      // "1 to 10 at night" does not establish whether the start is 01:00 or 13:00.
      if (!/صبح|شب|عصر|ظهر/.test(window[1]) && /شب|عصر/.test(window[2]) && start !== null && start < 720) start = null;
      const previousEnd = index ? windows[index - 1].index! + windows[index - 1][0].length : 0;
      const prefixDays = weekdaysIn(line.slice(previousEnd, window.index));
      const suffixDays = weekdaysIn(line.slice(window.index! + window[0].length, windows[index + 1]?.index));
      const days = prefixDays.length ? [prefixDays[prefixDays.length - 1]] : suffixDays.length ? [suffixDays[0]] : [];
      schedule.sessions.push({ weekdays: days, start, end });
    }
    if (!windows.length && !/مشخص نیست|نامشخص/.test(line)) {
      const start = new RegExp(`^(?:از\\s+)?(${token})\\s*$`).exec(line.trim());
      if (start) schedule.sessions.push({ weekdays: [], start: minute(start[1]), end: null });
    }
  }
  return schedule;
}

export function sheetExactTimes(schedule: FlexibleSchedule) {
  const session = schedule.sessions[0];
  if (schedule.dates.length !== 1 || schedule.sessions.length !== 1 || !session || schedule.excluded_weekdays.includes(new Date(schedule.dates[0] + OFFSET).getUTCDay())) return { start: null, end: null };
  const start = session.start === null ? null : schedule.dates[0] + session.start * 60000;
  const end = session.end === null || session.end === session.start ? null : schedule.dates[0] + session.end * 60000 + (session.start !== null && session.end < session.start ? DAY : 0);
  return { start, end };
}
export function decodeEvent<T extends object>(row: T) {
  const { schedule_json, ...rest } = row as T & { schedule_json?: string | null; teaser_url?: string | null };
  return { ...rest, teaser: rest.teaser_url ?? null, ...(Object.hasOwn(rest, "sheet_managed") ? { sheet_managed: !!(rest as Record<string, unknown>).sheet_managed } : {}), schedule: schedule_json ? JSON.parse(schedule_json) as FlexibleSchedule : null };
}
export function tehranDay(now: number) { return Math.floor((now + OFFSET) / DAY) * DAY - OFFSET; }

/** Manual slots have exact daily times, but are not one continuous event window. */
export function nextManualSession(schedule: FlexibleSchedule, now: number) {
  const first = Math.max(tehranDay(now), schedule.range_start ?? schedule.dates[0] ?? tehranDay(now));
  const days = schedule.dates.length ? schedule.dates : Array.from({ length: 8 }, (_, i) => first + i * DAY);
  for (const day of days) {
    if (day < first || (schedule.range_end !== null && day > schedule.range_end)) continue;
    const weekday = new Date(day + OFFSET).getUTCDay();
    if ((schedule.weekdays.length && !schedule.weekdays.includes(weekday)) || schedule.excluded_weekdays.includes(weekday)) continue;
    for (const session of schedule.sessions) {
      if (session.start === null || session.end === null || (session.weekdays.length && !session.weekdays.includes(weekday))) continue;
      const start = day + session.start * 60000, end = day + session.end * 60000;
      if (end > now) return { day, start, end };
    }
  }
  return null;
}

/** Bounds are availability dates, never fabricated event start/end times. */
export function nextScheduleDay(event: ScheduledEvent, now: number): number | null {
  const schedule = event.schedule;
  if (!schedule) return event.starts_at;
  if (schedule.source === "manual") return nextManualSession(schedule, now)?.day ?? null;
  const today = tehranDay(now);
  if (schedule.dates.length) return schedule.dates.find(day => day + DAY > now && !schedule.excluded_weekdays.includes(new Date(day + OFFSET).getUTCDay())) ?? null;
  if (schedule.range_end !== null && schedule.range_end + DAY <= now) return null;
  if (schedule.range_end !== null || schedule.weekdays.length) {
    const first = Math.max(today, schedule.range_start ?? today);
    for (let day = first; day <= first + 7 * DAY && (schedule.range_end === null || day <= schedule.range_end); day += DAY) {
      const weekday = new Date(day + OFFSET).getUTCDay();
      if ((!schedule.weekdays.length || schedule.weekdays.includes(weekday)) && !schedule.excluded_weekdays.includes(weekday)) return day;
    }
  }
  return null;
}
export function eventAvailable(event: ScheduledEvent, now: number) {
  if (event.schedule?.source === "manual") return nextManualSession(event.schedule, now) !== null;
  if (!event.schedule) return event.starts_at !== null && event.ends_at !== null && event.ends_at > now;
  if (event.ends_at !== null) return event.ends_at > now;
  const schedule = event.schedule;
  if (schedule.range_end !== null && schedule.range_end + DAY <= now) return false;
  if (schedule.dates.length && schedule.dates.every(day => day + DAY <= now)) return false;
  return true;
}
export function eventSortTime(event: ScheduledEvent, now: number) {
  if (event.schedule?.source === "manual") return nextManualSession(event.schedule, now)?.start ?? Number.MAX_SAFE_INTEGER;
  if (event.starts_at !== null && event.starts_at > now) return event.starts_at;
  return nextScheduleDay(event, now) ?? Number.MAX_SAFE_INTEGER;
}
export function scheduleDateLabel(event: ScheduledEvent, full = false) {
  if (event.schedule?.date_text) return event.schedule.date_text;
  const start = date(event.starts_at, full);
  return event.starts_at !== null && event.ends_at !== null && tehranDay(event.starts_at) !== tehranDay(event.ends_at)
    ? `${start} تا ${date(event.ends_at, full)}` : start;
}

/** Compact public detail dates without changing the authored schedule or full labels. */
export function eventDetailDateLabel(event: ScheduledEvent) {
  const source = event.schedule?.date_text;
  if (!source) return scheduleDateLabel(event);
  const digit = "[0-9۰-۹٠-٩]";
  const year = `[1۱١][34۳۴٣٤]${digit}{2}`;
  const month = `(?:${months.join("|")})`;
  // Only years attached to an identifiable calendar date are removed. A year
  // inside recurrence prose, an identifier, or unknown source text stays intact.
  const label = source
    .replace(new RegExp(`(?<!\\p{L})(${month})\\s*(?:سال\\s*)?${year}(?![\\p{L}\\p{N}])`, "gu"), "$1")
    .replace(new RegExp(`(?<!${digit})(?:سال\\s*)?${year}\\s*(?=${month}(?!\\p{L}))`, "gu"),
      (_original, offset: number, value: string) => /\p{L}/u.test(value[offset - 1] ?? "") ? " " : "");
  return label.replace(
    new RegExp(`(?<!${digit})(${year})\\s*[/-]\\s*(${digit}{1,2})(\\s*[/-]\\s*)(${digit}{1,2})(?!${digit})`, "gu"),
    (original, numericYear: string, numericMonth: string, separator: string, numericDay: string) =>
      Number.isFinite(parsePersianDate(`${digits(numericYear)}/${digits(numericMonth)}/${digits(numericDay)}`, "00:00"))
        ? `${numericMonth}${separator}${numericDay}` : original,
  ).replace(
    new RegExp(`(?<!${digit})(${digit}{1,2})(\\s*[/-]\\s*)(${digit}{1,2})\\s*[/-]\\s*(${year})(?!${digit})`, "gu"),
    (original, numericDay: string, separator: string, numericMonth: string, numericYear: string) =>
      Number.isFinite(parsePersianDate(`${digits(numericYear)}/${digits(numericMonth)}/${digits(numericDay)}`, "00:00"))
        ? `${numericDay}${separator}${numericMonth}` : original,
  ).trim();
}
export function scheduleTimeLabel(event: ScheduledEvent) {
  return event.schedule?.time_text || (event.ends_at === null ? clock(event.starts_at) : `${clock(event.starts_at)} تا ${clock(event.ends_at)}`);
}
export function exactEventWindow(event: ScheduledEvent): event is ScheduledEvent & { starts_at: number; ends_at: number } {
  return event.starts_at !== null && event.ends_at !== null;
}

// SQL candidates are refined with the same evaluator used by browser filters.
export const availableEventSql = "(e.schedule_json IS NOT NULL OR (e.starts_at IS NOT NULL AND e.ends_at>?1))";

