import { faContent } from "@/locales/domain-fa";
export const REGISTRATION_DAY = 24 * 60 * 60 * 1000;
export const REGISTRATION_WINDOW = 4 * REGISTRATION_DAY;
export const REGISTRATION_CLOSED = faContent.registrationEnded;

export function validRegistrationDeadline(deadline: number, end: number, now: number) {
  return Number.isFinite(deadline) && deadline > now && deadline <= end &&
    deadline % (5 * 60 * 1000) === 0;
}

export function registrationClosesAt(event: { ends_at: number | null; registration_ends_at: number | null }) {
  if (event.ends_at === null) return undefined;
  return Math.min(event.ends_at, event.registration_ends_at ?? event.ends_at);
}

export function registrationCountdownMinutes(deadline: number, now: number): number | null {
  const remaining = deadline - now;
  if (!Number.isFinite(remaining) || remaining > REGISTRATION_WINDOW) return null;
  // Keep the final partial minute visible until registration actually closes.
  return Math.max(0, Math.ceil(remaining / 60000));
}

export function registrationClockDelay(deadline: number | undefined, now: number, refreshIntervalMs = 60000) {
  const remaining = deadline === undefined ? Infinity : deadline - now;
  const untilWindow = remaining - REGISTRATION_WINDOW;
  // Align updates with the displayed unit, including a partial first interval.
  const interval = remaining > 0 && remaining <= REGISTRATION_WINDOW
    ? remaining % refreshIntervalMs || refreshIntervalMs : 60000;
  return Math.max(1, Math.min(60000, interval, remaining > 0 ? remaining : 60000,
    untilWindow > 0 ? untilWindow : 60000));
}

export function registrationState(
  event: { starts_at: number | null; ends_at: number | null; registration_ends_at: number | null; remaining: number | null },
  now: number,
) {
  const closesAt = registrationClosesAt(event);
  if (event.starts_at === null || closesAt === undefined || !Number.isFinite(closesAt)) return "expired";
  if (event.ends_at !== null && event.ends_at <= now) return "ended";
  if (closesAt <= now) return "expired";
  if (event.remaining !== null && event.remaining <= 0) return "sold_out";
  return "open";
}
