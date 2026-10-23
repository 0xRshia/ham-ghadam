import { boundary, body, json, sameOrigin } from "@/lib/server";
import { requireFast } from "@/lib/fast-auth";
import { requireOrganizer } from "@/lib/fast-events";
import { createEventSeries, listEventSeries } from "@/lib/event-series";
export const GET = (req: Request) => boundary(async () => {
  await requireFast(req);
  const organizer = await requireOrganizer(new URL(req.url).searchParams.get("host_id"));
  return json({ series: await listEventSeries(organizer.id) });
});
export const POST = (req: Request) => boundary(async () => {
  sameOrigin(req); await requireFast(req, true);
  const data = await body(req);
  const organizer = await requireOrganizer(data.host_id);
  return json({ series: await createEventSeries(organizer.id, data) }, 201);
});
