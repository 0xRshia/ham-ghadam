import { database } from "@/db";
import { boundary, json, requireUser } from "@/lib/server";
export const GET = (req: Request) => boundary(async () => {
  const user = await requireUser(req);
  const { results } = await database().prepare("SELECT f.event_id FROM event_favorites f JOIN events e ON e.id=f.event_id WHERE f.user_id=? AND e.published=1 ORDER BY f.created_at DESC").bind(user.id).all<{ event_id: string }>();
  return json({ ids: results.map(row => row.event_id) });
});
