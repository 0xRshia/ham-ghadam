import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { boundary, json, requireUser } from "@/lib/server";
import { pageResult, readPage } from "@/lib/pagination";
export const GET = (req: Request) =>
  boundary(async () => {
    const host = await requireUser(req, true);
    const url = new URL(req.url);
    const { page, pageSize, offset } = readPage(url, 20);
    const status = url.searchParams.get("status") || "all";
    const allowed = ["all", "pending", "published", "rejected", "hidden"];
    const selected = allowed.includes(status) ? status : "all";
    const predicate = "er.status<>'withdrawn' AND (?2='all' OR er.status=?2)";
    const db = database();
    const count = await db
      .prepare(
        `SELECT COUNT(*) total FROM event_reviews er JOIN events e ON e.id=er.event_id WHERE e.host_id=?1 AND ${predicate}`,
      )
      .bind(host.id, selected)
      .first<{ total: number }>();
    const reviews = await db
      .prepare(
        `SELECT er.id,er.event_id,e.title event_title,er.user_id,COALESCE(u.name,?5) author_name,er.rating,er.comment,er.status,er.created_at,er.updated_at,rr.id reply_id,rr.comment reply_comment,rr.status reply_status,rr.updated_at reply_updated_at FROM event_reviews er JOIN events e ON e.id=er.event_id JOIN users u ON u.id=er.user_id LEFT JOIN review_replies rr ON rr.review_id=er.id WHERE e.host_id=?1 AND ${predicate} ORDER BY er.created_at DESC,er.id LIMIT ?3 OFFSET ?4`,
      )
      .bind(host.id, selected, pageSize, offset, faContent.guest)
      .all();
    const pagination = pageResult(
      reviews.results,
      count?.total ?? 0,
      page,
      pageSize,
    );
    return json({ ...pagination, status: selected });
  });
