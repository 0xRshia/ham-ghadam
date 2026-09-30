import { database } from "@/db";
import { organizerSelect } from "@/lib/organizers";
import { boundary, json, currentUser } from "@/lib/server";
export const GET = (req: Request) => boundary(async () => {
  const user = await currentUser(req);
  const onlyFollowing = new URL(req.url).searchParams.get("following") === "true";
  const { results } = await database().prepare(organizerSelect + (onlyFollowing ? " AND EXISTS(SELECT 1 FROM organizer_follows WHERE organizer_id=u.id AND user_id=?1)" : "") + " ORDER BY followers DESC,u.name,u.id LIMIT 100").bind(user?.id ?? null).all();
  return json({ organizers: results });
});
