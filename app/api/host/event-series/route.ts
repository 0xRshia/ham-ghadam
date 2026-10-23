import { listEventSeries, createEventSeries } from "@/lib/event-series";
import { boundary, json, requireUser, sameOrigin, body } from "@/lib/server";
export const GET = (req: Request) => boundary(async () => {
  const user = await requireUser(req, true);
  return json({ series: await listEventSeries(user.id) });
});
export const POST = (req: Request) => boundary(async () => {
  sameOrigin(req);
  const user = await requireUser(req, true);
  return json({ series: await createEventSeries(user.id, await body(req)) }, 201);
});
