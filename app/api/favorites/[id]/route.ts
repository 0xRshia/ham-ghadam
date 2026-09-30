import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { getEvent } from "@/lib/events";
import { boundary, json, requireUser, sameOrigin, ApiError } from "@/lib/server";
type Context = { params: Promise<{ id: string }> };
export const PUT = (req: Request, { params }: Context) => boundary(async () => {
  sameOrigin(req); const user = await requireUser(req); const id = (await params).id;
  const event = await getEvent(id); if (!event?.published) throw new ApiError(404,faContent.eventMissing);
  await database().prepare("INSERT INTO event_favorites VALUES(?,?,?) ON CONFLICT DO NOTHING").bind(user.id,id,Date.now()).run();
  return json({ saved: true });
});
export const DELETE = (req: Request, { params }: Context) => boundary(async () => {
  sameOrigin(req); const user = await requireUser(req);
  await database().prepare("DELETE FROM event_favorites WHERE user_id=? AND event_id=?").bind(user.id,(await params).id).run();
  return json({ saved: false });
});
