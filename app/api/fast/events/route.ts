import { fastEventList } from "@/lib/fast-event-list";
import { boundary, json, sameOrigin } from "@/lib/server";
import { requireFast } from "@/lib/fast-auth";
import { saveFastEvent } from "@/lib/fast-events";
import { readEventSubmission, discardEventRequest } from "@/lib/event-media";
import { fastCopy } from "@/locales/fast-fa";

export const GET = (req: Request) => boundary(async () => {
  await requireFast(req);
  return json(await fastEventList(new URL(req.url)));
});

export const POST = (req: Request) => boundary(async () => {
  try { sameOrigin(req); await requireFast(req, true); }
  catch (error) { await discardEventRequest(req); throw error; }
  const { data, uploads } = await readEventSubmission(req);
  return json({ event: await saveFastEvent(data, uploads) }, 201);
}, { operation: "fast.events.create", message: fastCopy.saveFailed });
