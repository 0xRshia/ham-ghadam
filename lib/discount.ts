import { MAX_ORDER_TOMAN } from "./payment-limits";

// price remains the actual payable amount; original_price is display metadata.
export function discountPercent(price: number, originalPrice?: number | null) {
  if (!Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(originalPrice) || originalPrice! <= price) return null;
  return Math.round((originalPrice! - price) / originalPrice! * 100);
}

export function readOriginalPrice(value: unknown, price: number): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const amount = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isSafeInteger(amount) && amount > price && amount <= MAX_ORDER_TOMAN ? amount : undefined;
}
