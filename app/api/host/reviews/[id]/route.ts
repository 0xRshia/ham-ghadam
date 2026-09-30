import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import {
  ApiError,
  boundary,
  body,
  json,
  rateLimit,
  requireUser,
  sameOrigin,
} from "@/lib/server";
export const PUT = (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) =>
  boundary(async () => {
    sameOrigin(req);
    const host = await requireUser(req, true);
    await rateLimit(`host-reply:${host.id}`, 40);
    const data = await body(req);
    if (
      typeof data.comment !== "string" ||
      data.comment.trim().length < 1 ||
      data.comment.trim().length > 1200
    )
      throw new ApiError(400, faContent.replyLength);
    const { id: reviewId } = await params;
    const db = database();
    const owned = await db
      .prepare(
        "SELECT er.id FROM event_reviews er JOIN events e ON e.id=er.event_id WHERE er.id=? AND e.host_id=? AND er.status<>'withdrawn'",
      )
      .bind(reviewId, host.id)
      .first();
    if (!owned) throw new ApiError(404, faContent.reviewNotFound);
    const now = Date.now();
    await db
      .prepare(
        "INSERT INTO review_replies(id,review_id,host_id,comment,status,created_at,updated_at) VALUES(?,?,?,?,'pending',?,?) ON CONFLICT(review_id) DO UPDATE SET comment=excluded.comment,status='pending',updated_at=excluded.updated_at,moderated_by=NULL,moderated_at=NULL",
      )
      .bind(
        crypto.randomUUID(),
        reviewId,
        host.id,
        data.comment.trim(),
        now,
        now,
      )
      .run();
    return json({ ok: true, status: "pending" });
  });
