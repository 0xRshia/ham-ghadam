import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { boundary, json, requireUser, sameOrigin, body, ApiError } from "@/lib/server";
export const GET = (req: Request) => boundary(async () => {
  const user = await requireUser(req);
  const { results } = await database().prepare("SELECT id,kind,title,message,href,created_at,read_at FROM notifications WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 100").bind(user.id).all();
  return json({ notifications: results });
});
export const PATCH = (req: Request) => boundary(async () => {
  sameOrigin(req); const user = await requireUser(req); const data = await body(req);
  if (data.all === true) await database().prepare("UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL").bind(Date.now(),user.id).run();
  else if (typeof data.id === "string") await database().prepare("UPDATE notifications SET read_at=? WHERE user_id=? AND id=? AND read_at IS NULL").bind(Date.now(),user.id,data.id).run();
  else throw new ApiError(400,faContent.notificationNotSelected);
  return json({ ok: true });
});
