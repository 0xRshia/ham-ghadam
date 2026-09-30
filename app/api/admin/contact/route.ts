import { database } from "@/db";
import { boundary, json, requireAdmin } from "@/lib/server";
import { pageResult, readPage } from "@/lib/pagination";

const statuses = ["new", "in_progress", "resolved"] as const;
export const GET = (req: Request) => boundary(async () => {
  await requireAdmin(req);
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "new";
  const selected = statuses.includes(status as (typeof statuses)[number]) ? status : "new";
  const { page, pageSize, offset } = readPage(url, 20);
  const db = database();
  const [count, rows] = await Promise.all([
    db.prepare("SELECT COUNT(*) total FROM contact_messages WHERE status=?").bind(selected).first<{ total: number }>(),
    db.prepare("SELECT id,name,email,phone,subject,message,status,created_at,updated_at FROM contact_messages WHERE status=? ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,created_at DESC,id DESC LIMIT ? OFFSET ?").bind(selected, pageSize, offset).all(),
  ]);
  return json({ ...pageResult(rows.results ?? [], Number(count?.total ?? 0), page, pageSize), status: selected });
});
