import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import {
  ApiError,
  boundary,
  json,
  rateLimit,
  requireUser,
  sameOrigin,
} from "@/lib/server";
export const DELETE = (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) =>
  boundary(async () => {
    sameOrigin(req);
    const user = await requireUser(req);
    await rateLimit(`review-write:${user.id}`, 8);
    const { id } = await params;
    const result = await database()
      .prepare(
        "UPDATE event_reviews SET status='withdrawn',updated_at=?,moderated_by=NULL,moderated_at=NULL WHERE id=? AND user_id=? AND status<>'withdrawn' RETURNING id",
      )
      .bind(Date.now(), id, user.id)
      .first();
    if (!result) throw new ApiError(404, faContent.reviewNotFound);
    return json({ ok: true });
  });
