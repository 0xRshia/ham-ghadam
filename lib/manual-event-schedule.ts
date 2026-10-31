import { digits, faDigits, type EventItem } from "./types";
import { parsePersianDate, persianInput } from "./persian-date";
import { nextManualSession, type FlexibleSchedule } from "./event-schedule";

export const scheduleWeekdays = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
export const MAX_MANUAL_SESSIONS = 12;
export type ManualScheduleDraft = {
  mode: "single" | "sessions" | "weekly";
  date: string; time: string; endDate: string; endTime: string; until: string;
  weekdays: number[]; sessions: { start: string; end: string }[];
};
export const minuteTime = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const clock = (timestamp: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(timestamp);

export function initialManualSchedule(event?: Pick<EventItem, "starts_at" | "ends_at" | "schedule">): ManualScheduleDraft {
  const tomorrow = Date.now() + 86400000, schedule = event?.schedule;
  return {
    mode: schedule?.source === "manual" ? schedule.weekdays.length ? "weekly" : "sessions" : "single",
    date: persianInput(schedule?.range_start ?? schedule?.dates[0] ?? event?.starts_at ?? tomorrow),
    time: event?.starts_at == null ? "18:00" : clock(event.starts_at),
    endDate: persianInput(event?.ends_at ?? event?.starts_at ?? tomorrow),
    endTime: event?.ends_at == null ? "20:00" : clock(event.ends_at),
    until: schedule?.range_end == null ? "" : persianInput(schedule.range_end),
    weekdays: schedule?.weekdays.length ? [...schedule.weekdays] : [5],
    sessions: schedule?.source === "manual" ? schedule.sessions.map(session => ({ start: minuteTime(session.start!), end: minuteTime(session.end!) })) : [{ start: "11:00", end: "13:00" }, { start: "14:00", end: "16:00" }],
  };
}

export function manualScheduleFields(draft: ManualScheduleDraft) {
  return {
    date: draft.date, time: draft.time, endDate: draft.endDate, endTime: draft.endTime,
    schedule: draft.mode === "single" ? null : {
      kind: draft.mode, date: draft.date, endDate: draft.mode === "weekly" ? draft.until || null : null,
      weekdays: draft.mode === "weekly" ? draft.weekdays : [], sessions: draft.sessions,
    },
  };
}

/** Validate authored fields; never accept client-supplied timestamps or display prose. */
export function parseManualSchedule(value: unknown): FlexibleSchedule {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("نوع زمان‌بندی رویداد معتبر نیست.");
  const input = value as Record<string, unknown>;
  if (input.kind !== "weekly" && input.kind !== "sessions") throw new Error("نوع زمان‌بندی رویداد معتبر نیست.");
  function day(value: unknown, label: string) {
    const parsed = typeof value === "string" && value.length <= 10 ? parsePersianDate(value, "00:00") : NaN;
    if (!Number.isFinite(parsed)) throw new Error(`تاریخ ${label} معتبر نیست؛ تاریخ شمسی وارد کنید.`);
    return parsed;
  }
  const start = day(input.date, "شروع");
  const end = input.endDate == null || input.endDate === "" ? null : day(input.endDate, "پایان تکرار");
  if (end !== null && (input.kind !== "weekly" || end < start || end > start + 730 * 86400000)) throw new Error("پایان تکرار باید از تاریخ شروع تا حداکثر دو سال بعد باشد.");
  if (!Array.isArray(input.weekdays) || input.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error("روزهای هفته معتبر نیستند.");
  const weekdays = [...new Set(input.weekdays as number[])].sort((a, b) => a - b);
  if (input.kind === "weekly" ? !weekdays.length : weekdays.length) throw new Error("برای تکرار هفتگی حداقل یک روز هفته انتخاب کنید.");
  if (!Array.isArray(input.sessions) || input.sessions.length < 1 || input.sessions.length > MAX_MANUAL_SESSIONS) throw new Error("بین یک تا دوازده سانس وارد کنید.");
  function minute(value: unknown) {
    const match = typeof value === "string" && /^(\d{2}):(\d{2})$/.exec(digits(value));
    if (!match || +match[1] > 23 || +match[2] > 59 || +match[2] % 5) throw new Error("ساعت سانس معتبر نیست؛ دقیقه باید مضرب پنج باشد.");
    return +match[1] * 60 + +match[2];
  }
  const sessions = input.sessions.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("سانس معتبر نیست.");
    const start = minute(value.start), end = minute(value.end);
    if (end <= start) throw new Error("پایان هر سانس باید بعد از شروع و در همان روز باشد.");
    return { weekdays: [], start, end };
  }).sort((a, b) => a.start - b.start);
  if (sessions.some((session, i) => i > 0 && session.start < sessions[i - 1].end)) throw new Error("سانس‌ها نباید هم‌پوشانی داشته باشند.");
  const schedule: FlexibleSchedule = {
    kind: "flexible", source: "manual", year: +persianInput(start).slice(0, 4),
    date_text: input.kind === "weekly" ? `هر هفته ${[6, 0, 1, 2, 3, 4, 5].filter(d => weekdays.includes(d)).map(d => scheduleWeekdays[d]).join(" و ")}، از ${faDigits(persianInput(start))}${end === null ? "" : ` تا ${faDigits(persianInput(end))}`}` : faDigits(persianInput(start)),
    time_text: sessions.map(session => `${faDigits(minuteTime(session.start))} تا ${faDigits(minuteTime(session.end))}`).join("، "),
    dates: input.kind === "sessions" ? [start] : [], range_start: input.kind === "weekly" ? start : null,
    range_end: end, weekdays, excluded_weekdays: [], sessions,
  };
  if (!nextManualSession(schedule, start - 1)) throw new Error("در بازهٔ انتخاب‌شده هیچ روز برگزاری وجود ندارد.");
  return schedule;
}

export function manualScheduleEnd(schedule: FlexibleSchedule) {
  const day = schedule.range_end ?? schedule.dates.at(-1);
  if (day == null) return null;
  // Find the last actual occurrence, not simply the final day of the date range.
  for (let offset = 0; offset < 7; offset++) {
    const current = day - offset * 86400000;
    if (current < (schedule.range_start ?? schedule.dates[0])) break;
    const weekday = new Date(current + 210 * 60000).getUTCDay();
    if (!schedule.weekdays.length || schedule.weekdays.includes(weekday)) return current + (schedule.sessions.at(-1)?.end ?? 0) * 60000;
  }
  return null;
}

export function manualDraftEnd(draft: ManualScheduleDraft): number | null {
  if (draft.mode === "single") {
    const end = parsePersianDate(draft.endDate, draft.endTime);
    return Number.isFinite(end) ? end : null;
  }
  try { return manualScheduleEnd(parseManualSchedule(manualScheduleFields(draft).schedule)); }
  catch { return null; }
}
