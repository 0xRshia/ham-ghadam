import { MAX_ORDER_TOMAN } from "./payment-limits";

type TicketAvailability = { remaining: number | null; price: number };

export function maxTicketQuantity(event: TicketAvailability) {
  return Math.max(0, Math.min(6, event.remaining ?? 6,
    event.price > 0 ? Math.floor(MAX_ORDER_TOMAN / event.price) : 6));
}

export function requestedTicketQuantity(requested: string | null, event: TicketAvailability) {
  if (!requested || !/^[1-6]$/.test(requested)) return 0;
  return Math.min(Number(requested), maxTicketQuantity(event));
}
