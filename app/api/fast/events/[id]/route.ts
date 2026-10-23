import { database } from "@/db";
import { ApiError, boundary, body, json, sameOrigin } from "@/lib/server";
import { requireFast } from "@/lib/fast-auth";
import { editRevision, fastEvent, saveFastEvent } from "@/lib/fast-events";
import { readEventSubmission, discardEventRequest } from "@/lib/event-media";
import { fastCopy } from "@/locales/fast-fa";
type Context = { params: Promise<{ id: string }> };

export const GET = (req: Request, context: Context) => boundary(async () => {
  await requireFast(req);
  return json({ event: await fastEvent((await context.params).id) });
});
export const PUT = (req: Request, context: Context) => boundary(async () => {
  try { sameOrigin(req); await requireFast(req, true); }
  catch (error) { await discardEventRequest(req); throw error; }
  const { data, uploads } = await readEventSubmission(req);
  return json({ event: await saveFastEvent(data, uploads, (await context.params).id) });
});
export const PATCH = (req: Request, context: Context) => boundary(async () => {
  sameOrigin(req); await requireFast(req, true);
  const id = (await context.params).id;
  const data = await body(req);
  const revision = editRevision(data.revision);
  if (typeof data.published !== "boolean") throw new ApiError(400, fastCopy.conflict);
  await fastEvent(id);
  const row = await database().prepare("UPDATE events SET published=?,revision=revision+1 WHERE id=? AND revision=? RETURNING id")
    .bind(data.published ? 1 : 0,id,revision).first();
  if (!row) throw new ApiError(409, fastCopy.conflict);
  return json({ event: await fastEvent(id) });
});
export const DELETE = (req: Request, context: Context) => boundary(async () => {
  sameOrigin(req); await requireFast(req, true);
  const id = (await context.params).id;
  const revision = editRevision((await body(req)).revision);
  const event = await fastEvent(id);
  if (!event.canDelete) throw new ApiError(409, fastCopy.deleteBlocked);
  const row = await database().prepare("DELETE FROM events WHERE id=?1 AND revision=?2 AND NOT EXISTS(SELECT 1 FROM reservations WHERE event_id=?1) AND NOT EXISTS(SELECT 1 FROM event_reviews WHERE event_id=?1) RETURNING id").bind(id,revision).first();
  if (!row) throw new ApiError(409, fastCopy.conflict);
  // Keep immutable media objects so snapshots already being backed up remain valid.
  return json({ deleted: true });
});
