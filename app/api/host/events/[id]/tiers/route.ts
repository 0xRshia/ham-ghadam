import { getTicketTiers } from "@/lib/ticket-tiers";
import { saveEventTiers } from "@/lib/event-tier-management";
import { requireHostEvent } from "@/lib/host-attendees";
import { boundary, json, sameOrigin, body } from "@/lib/server";
type Context = { params: Promise<{ id: string }> };
export const GET = (req: Request, context: Context) => boundary(async () => {
  const event = await requireHostEvent(req, (await context.params).id);
  return json({ tiers: await getTicketTiers(event.id, true) });
});
export const PUT = (req: Request, context: Context) => boundary(async () => {
  sameOrigin(req);
  const event = await requireHostEvent(req, (await context.params).id);
  return json({ tiers: await saveEventTiers(event.id, event.host_id, await body(req, 40000)) });
});
