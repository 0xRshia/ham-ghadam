import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { deleteMedia, writeMedia } from "@/lib/media-storage";
import { discardEventRequest, readEventSubmission } from "@/lib/event-media";
import { ApiError, boundary, json, rateLimit, requireAdmin, sameOrigin } from "@/lib/server";

export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => boundary(async () => {
  let admin: Awaited<ReturnType<typeof requireAdmin>>;
  try { sameOrigin(req); admin = await requireAdmin(req); }
  catch (error) { await discardEventRequest(req); throw error; }
  await rateLimit(`admin-article-cover:${admin.id}`, 40, 300);
  const { id: articleId } = await params;
  const article = await database().prepare("SELECT id FROM articles WHERE id=?").bind(articleId).first();
  if (!article) throw new ApiError(404, faContent.articleNotFound);
  const { uploads } = await readEventSubmission(req);
  if (uploads.length !== 1 || uploads[0].role !== "cover") throw new ApiError(400, faContent.selectOneCover);
  const upload = uploads[0];
  const id = crypto.randomUUID();
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[upload.contentType];
  const storageKey = `${id}.${extension}`;
  const now = Date.now();
  await writeMedia(storageKey, upload.bytes, upload.contentType);
  try {
    await database().prepare("INSERT INTO article_media(id,article_id,storage_key,content_type,byte_size,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(article_id) DO UPDATE SET id=excluded.id,storage_key=excluded.storage_key,content_type=excluded.content_type,byte_size=excluded.byte_size,created_at=excluded.created_at").bind(id, articleId, storageKey, upload.contentType, upload.bytes.byteLength, now).run();
  } catch (error) {
    await deleteMedia(storageKey).catch(() => console.error("Article cover cleanup failed", storageKey));
    throw error;
  }
  // Keep old keys immutable so a backup that already captured the previous
  // database snapshot can still copy its referenced cover safely.
  return json({ id, url: `/api/article-media/${id}` });
});

export const DELETE = (req: Request, { params }: { params: Promise<{ id: string }> }) => boundary(async () => {
  sameOrigin(req);
  const admin = await requireAdmin(req);
  await rateLimit(`admin-article-cover:${admin.id}`, 40, 300);
  const { id: articleId } = await params;
  const db = database();
  const article = await db.prepare("SELECT id FROM articles WHERE id=?").bind(articleId).first();
  if (!article) throw new ApiError(404, faContent.articleNotFound);
  const media = await db.prepare("SELECT id,storage_key FROM article_media WHERE article_id=?").bind(articleId).first<{ id: string; storage_key: string }>();
  if (!media) return json({ deleted: true });
  await db.prepare("DELETE FROM article_media WHERE id=?").bind(media.id).run();
  // The unreferenced object remains available to a backup that captured the
  // prior database snapshot before this delete.
  return json({ deleted: true });
});
