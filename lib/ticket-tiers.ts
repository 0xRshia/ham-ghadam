import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { ApiError } from "@/lib/server";
import type { TicketTier, TicketSelection } from "@/lib/types";

export const tierSelect = `SELECT t.*,CASE WHEN t.capacity IS NULL THEN NULL ELSE MAX(0,t.capacity-COALESCE((SELECT SUM(i.quantity) FROM reservation_items i JOIN reservations r ON r.id=i.reservation_id WHERE i.tier_id=t.id AND (r.status='confirmed' OR (r.status='hold' AND r.expires_at>?1))),0)) END remaining FROM event_ticket_tiers t`;
export async function getTicketTiers(eventId: string, includeInactive = false) {
  const { results } = await database().prepare(tierSelect + " WHERE t.event_id=?2" + (includeInactive ? "" : " AND t.active=1") + " ORDER BY t.position,t.id").bind(Date.now(), eventId).all<TicketTier>();
  return results;
}
export function readTicketSelection(value: unknown): TicketSelection[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) throw new ApiError(400, faContent.invalidSelectedTickets);
  const seen = new Set<string>();
  let total = 0;
  const items = value.map(item => {
    if (!item || typeof item !== "object" || typeof item.tierId !== "string" || item.tierId.length > 80 || seen.has(item.tierId) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 6) throw new ApiError(400, faContent.invalidSelectedTickets);
    seen.add(item.tierId); total += item.quantity;
    return { tierId: item.tierId as string, quantity: item.quantity as number };
  });
  if (total > 6) throw new ApiError(400, faContent.maxSixTickets);
  return items.sort((a, b) => a.tierId.localeCompare(b.tierId));
}

// Both inventory levels and the quoted total are checked in the reservation INSERT.
// The item INSERT runs in the same database batch, and only targets the fresh random ID.
export const reserveTiersSql = `WITH chosen AS (
 SELECT t.*,CAST(json_extract(j.value,'$.quantity') AS INTEGER) quantity
 FROM json_each(?10) j JOIN event_ticket_tiers t ON t.id=json_extract(j.value,'$.tierId') AND t.event_id=?3 AND t.active=1
), totals AS (SELECT SUM(price*quantity) total,SUM(quantity) quantity,COUNT(*) count FROM chosen)
INSERT INTO reservations(id,user_id,event_id,quantity,total,amount_rial,status,request_key,created_at,expires_at,payment_state,attendee_name,attendee_phone)
SELECT ?1,?2,e.id,s.quantity,s.total,s.total*10,CASE WHEN s.total=0 OR ?9=1 THEN 'confirmed' ELSE 'hold' END,?5,?6,CASE WHEN s.total=0 OR ?9=1 THEN NULL ELSE ?7 END,CASE WHEN s.total=0 THEN 'none' WHEN ?9=1 THEN 'skipped_dev' ELSE 'requesting' END,?8,(SELECT phone FROM users WHERE id=?2)
FROM events e,totals s WHERE e.id=?3 AND e.published=1 AND e.starts_at>?6 AND e.registration_ends_at>?6
AND s.quantity=?4 AND s.quantity BETWEEN 1 AND 6 AND s.total=?11 AND s.count=json_array_length(?10)
AND (e.capacity IS NULL OR s.quantity+COALESCE((SELECT SUM(quantity) FROM reservations WHERE event_id=e.id AND (status='confirmed' OR (status='hold' AND expires_at>?6))),0)<=e.capacity)
AND NOT EXISTS(SELECT 1 FROM chosen c WHERE c.capacity IS NOT NULL AND c.quantity+COALESCE((SELECT SUM(i.quantity) FROM reservation_items i JOIN reservations r ON r.id=i.reservation_id WHERE i.tier_id=c.id AND (r.status='confirmed' OR (r.status='hold' AND r.expires_at>?6))),0)>c.capacity)
ON CONFLICT(user_id,request_key) DO NOTHING RETURNING *`;
export const insertReservationItemsSql = `INSERT INTO reservation_items(reservation_id,tier_id,tier_name,quantity,unit_price)
SELECT r.id,t.id,t.name,CAST(json_extract(j.value,'$.quantity') AS INTEGER),t.price FROM reservations r,json_each(?2) j JOIN event_ticket_tiers t ON t.id=json_extract(j.value,'$.tierId') AND t.event_id=r.event_id WHERE r.id=?1`;
