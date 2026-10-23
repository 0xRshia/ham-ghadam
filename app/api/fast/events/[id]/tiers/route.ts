import { boundary, body, json, sameOrigin } from "@/lib/server";
import { requireFast } from "@/lib/fast-auth";
import { fastEvent } from "@/lib/fast-events";
import { saveEventTiers } from "@/lib/event-tier-management";
type Context = { params: Promise<{ id: string }> };
export const GET = (req: Request, context: Context) => boundary(async () => {
  await requireFast(req);
  return json({ tiers: (await fastEvent((await context.params).id)).ticketTiers });
});
export const PUT = (req: Request, context: Context) => boundary(async () => {
  sameOrigin(req); await requireFast(req, true);
  const event = await fastEvent((await context.params).id);
  return json({ tiers: await saveEventTiers(event.id, event.host_id, await body(req, 40000)) });
});
