import { database } from "@/db";
import { boundary, json, requireUser, sameOrigin, ApiError, rateLimit } from "@/lib/server";
import { copy } from "@/locales/fa";
type Context = { params: Promise<{ id: string }> };
export const PUT = (req: Request, { params }: Context) => boundary(async () => {
  sameOrigin(req);
  const user = await requireUser(req), id = (await params).id;
  await rateLimit(`collection-follow:${user.id}`,100);
  const result = await database().prepare(`INSERT INTO collection_follows(user_id,collection_id,created_at)
    SELECT ?1,id,?2 FROM collections WHERE id=?3 AND published=1 AND owner_id<>?1
    ON CONFLICT(user_id,collection_id) DO UPDATE SET created_at=collection_follows.created_at
    RETURNING collection_id`).bind(user.id,Date.now(),id).first();
  if (!result) throw new ApiError(404,copy.collectionUnavailable);
  return json({ ok: true });
});
export const DELETE = (req: Request, { params }: Context) => boundary(async () => {
  sameOrigin(req);
  const user = await requireUser(req);
  await database().prepare("DELETE FROM collection_follows WHERE user_id=? AND collection_id=?").bind(user.id,(await params).id).run();
  return json({ ok: true });
});
