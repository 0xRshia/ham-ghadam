import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { ApiError, body, boundary, json, rateLimit, requireAdmin, sameOrigin } from "@/lib/server";
import { articleInput } from "@/lib/article-validation";

export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => boundary(async () => {
  await requireAdmin(req);
  const { id } = await params;
  const article = await database().prepare("SELECT a.*,m.id AS media_id FROM articles a LEFT JOIN article_media m ON m.article_id=a.id WHERE a.id=?").bind(id).first();
  if (!article) throw new ApiError(404, faContent.articleNotFound);
  return json(article);
});

export const PUT = (req: Request, { params }: { params: Promise<{ id: string }> }) => boundary(async () => {
  sameOrigin(req);
  const admin = await requireAdmin(req);
  await rateLimit(`admin-articles:${admin.id}`, 100, 100);
  const { id } = await params;
  const data = articleInput(await body(req, 210000));
  const db = database();
  const prior = await db.prepare("SELECT status,published_at FROM articles WHERE id=?").bind(id).first<{ status: string; published_at: number | null }>();
  if (!prior) throw new ApiError(404, faContent.articleNotFound);
  const now = Date.now();
  const publishedAt = data.status === "draft" ? null : prior.status === "published" && prior.published_at !== null ? prior.published_at : now;
  try {
    await db.prepare("UPDATE articles SET slug=?,title=?,excerpt=?,body=?,category=?,author_name=?,status=?,published_at=?,updated_at=?,updated_by=? WHERE id=?").bind(data.slug, data.title, data.excerpt, data.body, data.category, data.author_name, data.status, publishedAt, now, admin.id, id).run();
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed: articles.slug")) throw new ApiError(409, faContent.articleSlugTaken);
    throw error;
  }
  return json({ id, ...data, published_at: publishedAt });
});

export const DELETE = (req: Request, { params }: { params: Promise<{ id: string }> }) => boundary(async () => {
  sameOrigin(req);
  const admin = await requireAdmin(req);
  await rateLimit(`admin-articles:${admin.id}`, 100, 100);
  const { id } = await params;
  const db = database();
  const article = await db.prepare("SELECT id FROM articles WHERE id=?").bind(id).first();
  if (!article) throw new ApiError(404, faContent.articleNotFound);
  // Media keys stay immutable so in-flight backups can read their snapshot's
  // original cover. Unreferenced files are harmless and are excluded from backups.
  await db.prepare("DELETE FROM articles WHERE id=?").bind(id).run();
  return json({ deleted: true });
});
