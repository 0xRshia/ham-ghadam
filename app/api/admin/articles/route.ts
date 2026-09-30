import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { ApiError, body, boundary, json, rateLimit, requireAdmin, sameOrigin } from "@/lib/server";
import { pageResult, readPage } from "@/lib/pagination";
import { articleInput } from "@/lib/article-validation";

export const GET = (req: Request) => boundary(async () => {
  await requireAdmin(req);
  const url = new URL(req.url);
  const { page, pageSize, offset } = readPage(url, 20);
  const status = url.searchParams.get("status");
  const where = status === "draft" || status === "published" ? "WHERE a.status=?" : "";
  const db = database();
  const countQuery = db.prepare(`SELECT COUNT(*) AS total FROM articles a ${where}`);
  const rowsQuery = db.prepare(`SELECT a.id,a.slug,a.title,a.excerpt,a.category,a.author_name,a.status,a.published_at,a.created_at,a.updated_at,m.id AS media_id FROM articles a LEFT JOIN article_media m ON m.article_id=a.id ${where} ORDER BY a.updated_at DESC,a.created_at DESC,a.id DESC LIMIT ? OFFSET ?`);
  const [count, rows] = status === "draft" || status === "published"
    ? await Promise.all([countQuery.bind(status).first<{ total: number }>(), rowsQuery.bind(status, pageSize, offset).all()])
    : await Promise.all([countQuery.first<{ total: number }>(), rowsQuery.bind(pageSize, offset).all()]);
  return json(pageResult(rows.results ?? [], Number(count?.total ?? 0), page, pageSize));
});

export const POST = (req: Request) => boundary(async () => {
  sameOrigin(req);
  const admin = await requireAdmin(req);
  await rateLimit(`admin-articles:${admin.id}`, 100, 100);
  const data = articleInput(await body(req, 210000));
  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await database().prepare("INSERT INTO articles(id,slug,title,excerpt,body,category,author_name,status,published_at,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, data.slug, data.title, data.excerpt, data.body, data.category, data.author_name, data.status, data.status === "published" ? now : null, now, now, admin.id).run();
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed: articles.slug")) throw new ApiError(409, faContent.articleSlugTaken);
    throw error;
  }
  return json({ id, ...data, published_at: data.status === "published" ? now : null }, 201);
});
