import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { eventSelect } from "@/lib/events";
import { boundary, json, requireUser, currentUser, sameOrigin, body, ApiError } from "@/lib/server";
import { collectionSelect, collectionView, type CollectionRecord } from "@/lib/collections";
type Context = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: Context) => boundary(async () => {
  const user = await currentUser(req); const id = (await params).id;
  const collection = await database().prepare(collectionSelect + " WHERE c.id=?3 AND (c.published=1 OR c.owner_id=?1)").bind(user?.id ?? null,Date.now(),id).first<CollectionRecord>();
  if (!collection) throw new ApiError(404,faContent.collectionNotFound);
  const { results } = await database().prepare(eventSelect + " JOIN collection_events ce ON ce.event_id=e.id WHERE ce.collection_id=?2 AND e.published=1 ORDER BY ce.position").bind(Date.now(),id).all();
  return json({ collection: collectionView(collection), events: results, editable: collection.owner_id === user?.id });
});
export const PATCH = (req: Request, { params }: Context) => boundary(async () => {
  sameOrigin(req); const user = await requireUser(req); const id = (await params).id; const data = await body(req);
  const db = database();
  if (!await db.prepare("SELECT id FROM collections WHERE id=? AND owner_id=?").bind(id,user.id).first()) throw new ApiError(404,faContent.collectionNotFound);
  if (typeof data.title !== "string" || data.title.trim().length < 2 || data.title.trim().length > 100 || typeof data.description !== "string" || data.description.length > 2000 || typeof data.published !== "boolean" || !Array.isArray(data.eventIds) || data.eventIds.length > 100 || data.eventIds.some((value: unknown) => typeof value !== "string" || value.length > 80)) throw new ApiError(400,faContent.invalidCollection);
  const ids = [...new Set(data.eventIds)] as string[];
  if (ids.length) {
    const found = await db.prepare("SELECT COUNT(*) total FROM events WHERE published=1 AND id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).first<{ total: number }>();
    if (found?.total !== ids.length) throw new ApiError(400,faContent.eventUnavailable);
  }
  await db.batch([
    db.prepare("UPDATE collections SET title=?,description=?,published=?,updated_at=? WHERE id=? AND owner_id=?").bind(data.title.trim(),data.description.trim(),Number(data.published),Date.now(),id,user.id),
    db.prepare("DELETE FROM collection_events WHERE collection_id=? AND event_id NOT IN (SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM collections WHERE id=? AND owner_id=?)").bind(id,JSON.stringify(ids),id,user.id),
    ...ids.map((eventId,position) => db.prepare("INSERT INTO collection_events(collection_id,event_id,position,added_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM collections WHERE id=? AND owner_id=?) ON CONFLICT(collection_id,event_id) DO UPDATE SET position=excluded.position").bind(id,eventId,position,Date.now(),id,user.id)),
  ]);
  return json({ ok: true });
});
export const DELETE = (req: Request, { params }: Context) => boundary(async () => {
  sameOrigin(req); const user = await requireUser(req);
  await database().prepare("DELETE FROM collections WHERE id=? AND owner_id=?").bind((await params).id,user.id).run();
  return json({ ok: true });
});
