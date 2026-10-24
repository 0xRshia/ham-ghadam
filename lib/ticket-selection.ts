import type { EventDetailData, TicketTier } from "./types";
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

export function eventTicketTiers(event: EventDetailData, regularName: string): TicketTier[] {
  return event.ticketTiers?.length ? event.ticketTiers.filter(tier => !!tier.active) : [{
    id: "standard", event_id: event.id, name: regularName, description: event.description,
    price: event.price, original_price: event.original_price, remaining: event.remaining, capacity: event.capacity, position: 0, active: 1,
  }];
}

export function ticketSelection(tiers: TicketTier[], counts: Record<string, number>, remaining: number | null) {
  const selected = tiers.filter(tier => (counts[tier.id] ?? 0) > 0);
  const quantity = tiers.reduce((sum, tier) => sum + (counts[tier.id] ?? 0), 0);
  const total = tiers.reduce((sum, tier) => sum + tier.price * (counts[tier.id] ?? 0), 0);
  const knownIds = new Set(tiers.map(tier => tier.id));
  const valid = Object.entries(counts).every(([id, count]) => Number.isInteger(count) && count >= 0 && (count === 0 || knownIds.has(id))) &&
    quantity > 0 && quantity <= 6 && quantity <= (remaining ?? 6) && Number.isFinite(total) && total <= MAX_ORDER_TOMAN &&
    selected.every(tier => counts[tier.id] <= (tier.remaining ?? 6));
  const canAdd = (tier: TicketTier) => quantity < 6 && quantity < (remaining ?? 6) && (counts[tier.id] ?? 0) < (tier.remaining ?? 6) && total + tier.price <= MAX_ORDER_TOMAN;
  return { selected, quantity, total, valid, canAdd };
}
