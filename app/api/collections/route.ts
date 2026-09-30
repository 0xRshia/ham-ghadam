import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { boundary, json, requireUser, currentUser, sameOrigin, body, ApiError } from "@/lib/server";
import { collectionSelect, collectionView, type CollectionRecord } from "@/lib/collections";
export const GET = (req: Request) => boundary(async () => {
  const params = new URL(req.url).searchParams;
  const discover = params.get("discover") === "true";
  const user = discover ? await currentUser(req) : await requireUser(req);
  const followed = params.get("following") === "true";
  const predicate = discover ? "c.published=1" : followed ? "c.published=1 AND EXISTS(SELECT 1 FROM collection_follows WHERE collection_id=c.id AND user_id=?1)" : "c.owner_id=?1";
  const { results } = await database().prepare(collectionSelect + ` WHERE ${predicate} ORDER BY c.updated_at DESC LIMIT 100`).bind(user?.id ?? null,Date.now()).all<CollectionRecord>();
  return json({ collections: results.map(collectionView) });
});
export const POST = (req: Request) => boundary(async () => {
  sameOrigin(req); const user = await requireUser(req); const data = await body(req);
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (title.length < 2 || title.length > 100) throw new ApiError(400,faContent.collectionNameLength);
  const id = crypto.randomUUID(), now = Date.now();
  await database().prepare("INSERT INTO collections(id,owner_id,title,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id,user.id,title,now,now).run();
  return json({ id },201);
});
