import type { Collection } from "@/lib/community-types";

// Viewer and current time are always ?1 and ?2; route predicates start at ?3.
export const collectionSelect = `SELECT c.id,c.owner_id,c.title,c.description,c.published,c.created_at,c.updated_at,u.name owner_name,
  EXISTS(SELECT 1 FROM events WHERE host_id=c.owner_id AND published=1 AND sample=0) owner_is_organizer,
  COALESCE(c.image,(SELECT e.image FROM collection_events ce JOIN events e ON e.id=ce.event_id
    WHERE ce.collection_id=c.id AND e.published=1 AND e.image IS NOT NULL ORDER BY ce.position LIMIT 1)) image,
  (SELECT COUNT(*) FROM collection_events ce JOIN events e ON e.id=ce.event_id
    WHERE ce.collection_id=c.id AND e.published=1 AND e.ends_at>?2) event_count,
  EXISTS(SELECT 1 FROM collection_follows WHERE collection_id=c.id AND user_id=?1) following,
  (SELECT COUNT(*) FROM collection_follows WHERE collection_id=c.id) followers,
  (SELECT json_group_array(json_object('name',name,'avatar_url',avatar_url)) FROM
    (SELECT follower.name,p.avatar_url FROM collection_follows cf JOIN users follower ON follower.id=cf.user_id
      LEFT JOIN user_profiles p ON p.user_id=cf.user_id WHERE cf.collection_id=c.id ORDER BY cf.created_at DESC LIMIT 3)) follower_preview
  FROM collections c JOIN users u ON u.id=c.owner_id`;

export type CollectionRecord = Omit<Collection,"following" | "follower_preview" | "owner_is_organizer"> & { following: number; owner_is_organizer: number; follower_preview: string };
export function collectionView(record: CollectionRecord): Collection {
  return { ...record, following: !!record.following, owner_is_organizer: !!record.owner_is_organizer, follower_preview: JSON.parse(record.follower_preview) };
}
