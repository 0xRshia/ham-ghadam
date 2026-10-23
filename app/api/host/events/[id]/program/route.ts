import { getEventProgram, saveEventProgram } from "@/lib/event-program";
import { requireHostEvent } from "@/lib/host-attendees";
import { boundary, json, sameOrigin, body } from "@/lib/server";
type Context = { params: Promise<{ id: string }> };
export const GET = (req: Request, context: Context) => boundary(async () => {
  const event = await requireHostEvent(req, (await context.params).id);
  return json({ event, program: await getEventProgram(event.id) });
});
export const PUT = (req: Request, context: Context) => boundary(async () => {
  sameOrigin(req);
  const event = await requireHostEvent(req, (await context.params).id);
  return json({ program: await saveEventProgram(event, await body(req, 32000)) });
});
