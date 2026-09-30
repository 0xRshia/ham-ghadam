import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import {
  ApiError,
  boundary,
  body,
  json,
  rateLimit,
  requireAdmin,
  sameOrigin,
} from "@/lib/server";
export const PATCH = (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) =>
  boundary(async () => {
    sameOrigin(req);
    const admin = await requireAdmin(req);
    await rateLimit(`admin-review:${admin.id}`, 100);
    const data = await body(req);
    const { id } = await params;
    if (
      !["review", "reply"].includes(String(data.kind)) ||
      !["published", "rejected", "hidden"].includes(String(data.status))
    )
      throw new ApiError(400, faContent.invalidModerationStatus);
    const db = database();
    const now = Date.now();
    const result =
      data.kind === "review"
        ? await db
            .prepare(
              "UPDATE event_reviews SET status=?,moderated_by=?,moderated_at=?,updated_at=? WHERE id=? AND status<>'withdrawn' RETURNING id",
            )
            .bind(data.status, admin.id, now, now, id)
            .first()
        : await db
            .prepare(
              "UPDATE review_replies SET status=?,moderated_by=?,moderated_at=?,updated_at=? WHERE id=? RETURNING id",
            )
            .bind(data.status, admin.id, now, now, id)
            .first();
    if (!result) throw new ApiError(404, faContent.moderationItemNotFound);
    return json({ ok: true });
  });
