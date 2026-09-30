import { faContent } from "@/locales/domain-fa";
export const REGISTRATION_DAY = 24 * 60 * 60 * 1000;
export const REGISTRATION_WINDOW = 4 * REGISTRATION_DAY;
export const REGISTRATION_CLOSED = faContent.registrationEnded;

export function defaultRegistrationDeadline(start: number, now: number) {
  // At exactly 24 hours, subtracting a day would produce an invalid (present) deadline.
  return start - REGISTRATION_DAY > now ? start - REGISTRATION_DAY : start;
}

export function validRegistrationDeadline(deadline: number, start: number, now: number) {
  return Number.isFinite(deadline) && deadline > now && deadline <= start &&
    deadline % (5 * 60 * 1000) === 0;
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
  event: { starts_at: number; registration_ends_at: number; remaining: number | null },
  now: number,
) {
  if (event.starts_at <= now) return "started";
  if (event.registration_ends_at <= now) return "expired";
  if (event.remaining === 0) return "sold_out";
  return "open";
}
