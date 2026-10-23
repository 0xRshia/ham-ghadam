import { boundary, body, json, sameOrigin } from "@/lib/server";
import { requireFast } from "@/lib/fast-auth";
import { fastEvent } from "@/lib/fast-events";
import { saveEventProgram } from "@/lib/event-program";
type Context = { params: Promise<{ id: string }> };
export const GET = (req: Request, context: Context) => boundary(async () => {
  await requireFast(req);
  const event = await fastEvent((await context.params).id);
  return json({ event, program: event.program });
});
export const PUT = (req: Request, context: Context) => boundary(async () => {
  sameOrigin(req); await requireFast(req, true);
  const event = await fastEvent((await context.params).id);
  return json({ program: await saveEventProgram(event, await body(req, 32000)) });
});
