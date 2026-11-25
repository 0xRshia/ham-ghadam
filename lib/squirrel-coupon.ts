import { MIN_PAID_TOMAN } from "./payment-limits";

export const SQUIRREL_COUPON_TOMAN = 300_000;

export function normalizeSquirrelCoupon(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isSquirrelCoupon(value: string) {
  return /^FND-[A-F0-9]{24}$/.test(value);
}

export function squirrelTicketDiscount(subtotal: number) {
  if (subtotal <= SQUIRREL_COUPON_TOMAN) return Math.max(subtotal, 0);
  return Math.min(SQUIRREL_COUPON_TOMAN, subtotal - MIN_PAID_TOMAN);
}
