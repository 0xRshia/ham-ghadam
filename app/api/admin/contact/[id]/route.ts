import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { ApiError, body, boundary, json, rateLimit, requireAdmin, sameOrigin } from "@/lib/server";

export const PATCH = (req: Request, { params }: { params: Promise<{ id: string }> }) => boundary(async () => {
  sameOrigin(req);
  const admin = await requireAdmin(req);
  await rateLimit(`admin-contact:${admin.id}`, 120, 100);
  const data = await body(req);
  if (!["new", "in_progress", "resolved"].includes(String(data.status))) throw new ApiError(400, faContent.invalidMessageStatus);
  const { id } = await params;
  const result = await database().prepare("UPDATE contact_messages SET status=?,updated_at=? WHERE id=? RETURNING id").bind(data.status, Date.now(), id).first();
  if (!result) throw new ApiError(404, faContent.messageNotFound);
  return json({ updated: true });
});
