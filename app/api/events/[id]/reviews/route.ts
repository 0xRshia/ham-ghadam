import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import {
  ApiError,
  boundary,
  body,
  currentUser,
  json,
  rateLimit,
  requireUser,
  sameOrigin,
} from "@/lib/server";
import { pageResult, readPage } from "@/lib/pagination";

export const GET = (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) =>
  boundary(async () => {
    const { id } = await params;
    const db = database();
    const event = await db
      .prepare(
        "SELECT id,host_id,ends_at,sample,published FROM events WHERE id=?",
      )
      .bind(id)
      .first<{
        id: string;
        host_id: string;
        ends_at: number;
        sample: number;
        published: number;
      }>();
    if (!event || !event.published) throw new ApiError(404, faContent.eventNotFound);
    const { page, pageSize, offset } = readPage(new URL(req.url), 10);
    const total = await db
      .prepare(
        "SELECT COUNT(*) total FROM event_reviews WHERE event_id=? AND status='published'",
      )
      .bind(id)
      .first<{ total: number }>();
    const reviews = await db
      .prepare(
        "SELECT er.id,er.rating,er.comment,er.created_at,u.name author_name,rr.comment reply,rr.created_at reply_created_at FROM event_reviews er JOIN users u ON u.id=er.user_id LEFT JOIN review_replies rr ON rr.review_id=er.id AND rr.status='published' WHERE er.event_id=? AND er.status='published' ORDER BY er.created_at DESC,er.id LIMIT ? OFFSET ?",
      )
      .bind(id, pageSize, offset)
      .all();
    const viewer = await currentUser(req);
    let viewerReview = null,
      canReview = false;
    if (viewer) {
      viewerReview = await db
        .prepare(
          "SELECT id,rating,comment,status,created_at,updated_at FROM event_reviews WHERE event_id=? AND user_id=?",
        )
        .bind(id, viewer.id)
        .first();
      if (event.ends_at <= Date.now() && event.sample === 0)
        canReview = !!(await db
          .prepare(
            "SELECT 1 ok FROM reservations WHERE event_id=? AND user_id=? AND status='confirmed' AND ((total=0 AND payment_state='none') OR (total>0 AND payment_state='paid')) LIMIT 1",
          )
          .bind(id, viewer.id)
          .first());
    }
    const average = await db
      .prepare(
        "SELECT AVG(rating) average FROM event_reviews WHERE event_id=? AND status='published'",
      )
      .bind(id)
      .first<{ average: number | null }>();
    const pagination = pageResult(
      reviews.results,
      total?.total ?? 0,
      page,
      pageSize,
    );
    return json({
      reviews: pagination.items,
      total: pagination.total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: pagination.totalPages,
      rating_count: total?.total ?? 0,
      rating_average: average?.average ?? null,
      viewerReview,
      canReview: event.ends_at <= Date.now() && event.sample === 0 && canReview,
    });
  });

export const POST = (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) =>
  boundary(async () => {
    sameOrigin(req);
    const user = await requireUser(req);
    await rateLimit(`review-write:${user.id}`, 8);
    const data = await body(req);
    const { id: eventId } = await params;
    if (
      !Number.isInteger(data.rating) ||
      Number(data.rating) < 1 ||
      Number(data.rating) > 5 ||
      typeof data.comment !== "string" ||
      data.comment.trim().length > 2000
    )
      throw new ApiError(400, faContent.invalidReview);
    const db = database();
    const eligible = await db
      .prepare(
        "SELECT e.id FROM events e WHERE e.id=? AND e.published=1 AND e.sample=0 AND e.ends_at<=? AND EXISTS(SELECT 1 FROM reservations r WHERE r.event_id=e.id AND r.user_id=? AND r.status='confirmed' AND ((r.total=0 AND r.payment_state='none') OR (r.total>0 AND r.payment_state='paid')))",
      )
      .bind(eventId, Date.now(), user.id)
      .first();
    if (!eligible)
      throw new ApiError(
        403,
        faContent.reviewEligibility,
      );
    const now = Date.now();
    await db
      .prepare(
        "INSERT INTO event_reviews(id,event_id,user_id,rating,comment,status,created_at,updated_at) VALUES(?,?,?,?,?,'pending',?,?) ON CONFLICT(event_id,user_id) DO UPDATE SET rating=excluded.rating,comment=excluded.comment,status='pending',updated_at=excluded.updated_at,moderated_by=NULL,moderated_at=NULL",
      )
      .bind(
        crypto.randomUUID(),
        eventId,
        user.id,
        Number(data.rating),
        data.comment.trim(),
        now,
        now,
      )
      .run();
    return json({ ok: true, status: "pending" });
  });
