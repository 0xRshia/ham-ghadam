import { database } from "@/db";
import type { Organizer } from "@/lib/community-types";
export const organizerSelect = `SELECT o.id,COALESCE(NULLIF(u.name,''),o.name) name,o.instagram_handle,COALESCE(p.bio,'') bio,
  COALESCE(NULLIF(p.city,''),(SELECT city FROM events WHERE COALESCE(organizer_id,host_id)=o.id AND published=1 AND sample=0 ORDER BY starts_at DESC LIMIT 1),'') city,
  COALESCE(NULLIF(p.avatar_url,''),(SELECT '/api/organizer-media/'||id FROM organizer_media WHERE organizer_id=o.id AND (source='upload' OR instagram_handle=o.instagram_handle))) avatar_url,
  (SELECT image FROM events WHERE COALESCE(organizer_id,host_id)=o.id AND published=1 AND sample=0 AND image IS NOT NULL ORDER BY starts_at DESC LIMIT 1) cover_image,
  (SELECT COUNT(*) FROM organizer_follows WHERE organizer_id=o.id) followers,
  (SELECT COUNT(*) FROM events WHERE COALESCE(organizer_id,host_id)=o.id AND published=1 AND sample=0) event_count,
  EXISTS(SELECT 1 FROM organizer_follows WHERE organizer_id=o.id AND user_id=?1) following
  FROM organizers o LEFT JOIN users u ON u.id=o.user_id LEFT JOIN user_profiles p ON p.user_id=o.user_id
  WHERE EXISTS(SELECT 1 FROM events WHERE COALESCE(organizer_id,host_id)=o.id AND published=1 AND sample=0)`;
export async function getOrganizer(id: string | null, viewerId: string | null) {
  if (!id) return null;
  return database().prepare(organizerSelect + " AND o.id=?2").bind(viewerId,id).first<Organizer>();
}
