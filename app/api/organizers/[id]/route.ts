import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { getOrganizer } from "@/lib/organizers";
import { eventSelect } from "@/lib/events";
import { collectionSelect, collectionView, type CollectionRecord } from "@/lib/collections";
import { boundary, json, currentUser, ApiError } from "@/lib/server";
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => boundary(async () => {
  const user = await currentUser(req); const id = (await params).id;
  const organizer = await getOrganizer(id,user?.id ?? null);
  if (!organizer) throw new ApiError(404,faContent.organizerNotFound);
  const [events, collections] = await Promise.all([
    database().prepare(eventSelect + " WHERE e.host_id=?2 AND e.published=1 AND e.sample=0 ORDER BY e.starts_at DESC LIMIT 100").bind(Date.now(),id).all(),
    database().prepare(collectionSelect + " WHERE c.owner_id=?3 AND c.published=1 ORDER BY c.created_at DESC LIMIT 100").bind(user?.id ?? null,Date.now(),id).all<CollectionRecord>(),
  ]);
  return json({ organizer, events: events.results, collections: collections.results.map(collectionView) });
});
