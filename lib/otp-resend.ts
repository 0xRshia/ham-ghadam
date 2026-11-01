import { ClientError } from "@/lib/client";
import { faDigits } from "@/lib/types";

/** When the server allows the next SMS code for one phone number. */
export type ResendWindow = { phone: string; resendAt: number; serverNow: number };

export function resendWindow(phone: string, response: { resendAt?: number; resendAfter: number; serverNow?: number }): ResendWindow {
  const receivedAt = Date.now();
  return {
    phone,
    serverNow: response.serverNow ?? receivedAt,
    resendAt: response.resendAt ?? receivedAt + response.resendAfter * 1000,
  };
}

/** The server's resend deadline from a 429 cooldown/quota rejection, if any. */
export function resendWindowFromError(phone: string, error: unknown): ResendWindow | null {
  if (!(error instanceof ClientError) || error.status !== 429) return null;
  const { resendAt, resendAfter, serverNow } = error.details;
  if (typeof resendAt !== "number" || typeof resendAfter !== "number") return null;
  return resendWindow(phone, { resendAt, resendAfter, serverNow: typeof serverNow === "number" ? serverNow : undefined });
}

/** Whole seconds left before `phone` may request a new code. */
export function resendWait(window: ResendWindow | null, phone: string, now: number | null) {
  if (!window || window.phone !== phone || now === null) return 0;
  return Math.max(0, Math.ceil((window.resendAt - now) / 1000));
}

/** Persian m:ss, e.g. ۱:۰۵; longer waits (hourly quota) stay in minutes. */
export function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return faDigits(`${minutes}:${String(seconds % 60).padStart(2, "0")}`);
}
