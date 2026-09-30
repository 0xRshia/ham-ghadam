import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { getOrganizer } from "@/lib/organizers";
import { boundary, json, requireUser, sameOrigin, ApiError, rateLimit } from "@/lib/server";
type Context = { params: Promise<{ id: string }> };
export const PUT = (req: Request, { params }: Context) => boundary(async () => {
  sameOrigin(req); const user = await requireUser(req); const id = (await params).id;
  await rateLimit("follow:"+user.id,120);
  if (id === user.id) throw new ApiError(400,faContent.selfFollowRejected);
  if (!(await getOrganizer(id,user.id))) throw new ApiError(404,faContent.organizerNotFound);
  await database().prepare("INSERT INTO organizer_follows VALUES(?,?,?) ON CONFLICT DO NOTHING").bind(user.id,id,Date.now()).run();
  return json({ following: true });
});
export const DELETE = (req: Request, { params }: Context) => boundary(async () => {
  sameOrigin(req); const user = await requireUser(req);
  await database().prepare("DELETE FROM organizer_follows WHERE user_id=? AND organizer_id=?").bind(user.id,(await params).id).run();
  return json({ following: false });
});
