// The product aggregates and announces events. Catalog semantics stay in discovery
// mode: a stored zero price means "not specified", never "free".
export const DISCOVERY_ONLY = true;
export const NOT_PURCHASABLE_MESSAGE = "خرید بلیت برای این رویداد فعال نیست.";

// Purchases are offered only for events with an explicit per-person price. Events
// without a price stay informational; capacity decides sold-out separately.
// Tickets are sold for one exact session, so multi-session/recurring schedules
// (no single start) remain informational even when priced.
export function eventPurchasable(event: { price: number; starts_at: number | null; ends_at: number | null }) {
  return event.price > 0 && event.starts_at !== null && event.ends_at !== null;
}
