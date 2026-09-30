import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { getTicketTiers } from "@/lib/ticket-tiers";
import { MAX_ORDER_TOMAN, MIN_PAID_TOMAN } from "@/lib/payment-limits";
import { boundary, json, requireUser, sameOrigin, body, ApiError } from "@/lib/server";
type Context = { params: Promise<{ id: string }> };
async function owned(req: Request, context: Context) {
  const user = await requireUser(req, true); const id = (await context.params).id;
  if (!await database().prepare("SELECT id FROM events WHERE id=? AND host_id=?").bind(id,user.id).first()) throw new ApiError(404,faContent.eventMissing);
  return id;
}
export const GET = (req: Request, context: Context) => boundary(async () => json({ tiers: await getTicketTiers(await owned(req,context),true) }));
export const PUT = (req: Request, context: Context) => boundary(async () => {
  sameOrigin(req); const id = await owned(req,context); const data = await body(req,40000);
  if (!Array.isArray(data.tiers) || !data.tiers.length || data.tiers.length > 12) throw new ApiError(400,faContent.tierCountRange);
  const seen = new Set<string>();
  const tiers = data.tiers.map((tier: Record<string,unknown>, position: number) => {
    if (!tier || typeof tier !== "object" || typeof tier.name !== "string" || !tier.name.trim() || tier.name.trim().length > 80 || typeof tier.description !== "string" || tier.description.length > 2000 || !Number.isInteger(tier.price) || Number(tier.price) < 0 || Number(tier.price) > MAX_ORDER_TOMAN || (Number(tier.price) > 0 && Number(tier.price) < MIN_PAID_TOMAN) || (tier.capacity !== null && (!Number.isSafeInteger(tier.capacity) || Number(tier.capacity) < 0))) throw new ApiError(400,faContent.invalidTier);
    if (tier.active !== undefined && tier.active !== 0 && tier.active !== 1) throw new ApiError(400,faContent.invalidTierStatus);
    const tierId = typeof tier.id === "string" && /^[\w-]{1,80}$/.test(tier.id) ? tier.id : crypto.randomUUID();
    if (seen.has(tierId)) throw new ApiError(400,faContent.duplicateTierId); seen.add(tierId);
    return { id: tierId, name: tier.name.trim(), description: tier.description.trim(), price: Number(tier.price), capacity: tier.capacity as number | null, active: tier.active === 0 ? 0 : 1, position };
  });
  if (!tiers.some((tier: { active: number })=>tier.active===1)) throw new ApiError(400,faContent.activeTierRequired);
  const db = database();
  // Tiers remain addressable for existing reservations and payment callbacks.
  // Inventory below existing sales is rejected; capacity is never silently clamped.
  for (const tier of tiers) {
    const existing = await db.prepare("SELECT event_id FROM event_ticket_tiers WHERE id=?").bind(tier.id).first<{ event_id: string }>();
    if (existing && existing.event_id !== id) throw new ApiError(400,faContent.invalidTierId);
  }
  const encoded = JSON.stringify(tiers);
  const { results } = await db.prepare(`WITH input AS (
    SELECT json_extract(value,'$.id') id,json_extract(value,'$.name') name,json_extract(value,'$.description') description,json_extract(value,'$.price') price,json_extract(value,'$.capacity') capacity,json_extract(value,'$.position') position,json_extract(value,'$.active') active FROM json_each(?1)
  ) INSERT INTO event_ticket_tiers(id,event_id,name,description,price,capacity,active,position)
  SELECT i.id,?2,i.name,i.description,i.price,i.capacity,i.active,i.position FROM input i WHERE (SELECT COUNT(*) FROM input)+(SELECT COUNT(*) FROM event_ticket_tiers WHERE event_id=?2 AND id NOT IN (SELECT id FROM input))<=12 AND NOT EXISTS(
    SELECT 1 FROM input proposed WHERE proposed.capacity IS NOT NULL AND proposed.capacity<COALESCE((SELECT SUM(ri.quantity) FROM reservation_items ri JOIN reservations r ON r.id=ri.reservation_id WHERE ri.tier_id=proposed.id AND (r.status='confirmed' OR (r.status='hold' AND r.expires_at>?3))),0)
  ) AND NOT EXISTS(SELECT 1 FROM input proposed JOIN event_ticket_tiers t ON t.id=proposed.id WHERE t.event_id<>?2)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,price=excluded.price,capacity=excluded.capacity,active=excluded.active,position=excluded.position RETURNING id`).bind(encoded,id,Date.now()).all();
  if (results.length !== tiers.length) throw new ApiError(409,faContent.tierInventoryConflict);
  return json({ tiers: await getTicketTiers(id,true) });
});
