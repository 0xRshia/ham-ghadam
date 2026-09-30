import { database } from "@/db";
import { boundary, json, requireAdmin } from "@/lib/server";
import { pageResult, readPage } from "@/lib/pagination";
export const GET = (req: Request) =>
  boundary(async () => {
    await requireAdmin(req);
    const url = new URL(req.url);
    const { page, pageSize, offset } = readPage(url, 20);
    const status = url.searchParams.get("status") || "pending";
    const kind = url.searchParams.get("kind") || "all";
    const statuses = [
      "pending",
      "published",
      "rejected",
      "hidden",
      "withdrawn",
    ];
    const selected = statuses.includes(status) ? status : "pending";
    const whereKind =
      kind === "reply"
        ? "'reply'"
        : kind === "review"
          ? "'review'"
          : "'review','reply'";
    const sql = `SELECT * FROM (SELECT er.id,er.id record_id,'review' kind,er.event_id,e.title event_title,e.host_id,host.name host_name,er.user_id author_id,author.name author_name,er.rating,er.comment,er.status,er.created_at,er.updated_at,er.moderated_at,NULL reply_comment FROM event_reviews er JOIN events e ON e.id=er.event_id JOIN users host ON host.id=e.host_id JOIN users author ON author.id=er.user_id UNION ALL SELECT rr.id,rr.review_id record_id,'reply' kind,er.event_id,e.title event_title,rr.host_id,host.name host_name,er.user_id author_id,author.name author_name,er.rating,er.comment review_comment,rr.status,rr.created_at,rr.updated_at,rr.moderated_at,rr.comment reply_comment FROM review_replies rr JOIN event_reviews er ON er.id=rr.review_id JOIN events e ON e.id=er.event_id JOIN users host ON host.id=rr.host_id JOIN users author ON author.id=er.user_id) WHERE status=?1 AND kind IN (${whereKind}) ORDER BY created_at DESC,id LIMIT ?2 OFFSET ?3`;
    const countSql = `SELECT COUNT(*) total FROM (SELECT er.status,'review' kind FROM event_reviews er UNION ALL SELECT rr.status,'reply' kind FROM review_replies rr) WHERE status=?1 AND kind IN (${whereKind})`;
    const db = database();
    const [items, total] = await Promise.all([
      db.prepare(sql).bind(selected, pageSize, offset).all(),
      db.prepare(countSql).bind(selected).first<{ total: number }>(),
    ]);
    const pagination = pageResult(
      items.results,
      total?.total ?? 0,
      page,
      pageSize,
    );
    return json({ ...pagination, status: selected, kind });
  });
