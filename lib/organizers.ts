import { database } from "@/db";
import type { Organizer } from "@/lib/community-types";
export const organizerSelect = `SELECT u.id,u.name,COALESCE(p.bio,'') bio,COALESCE(NULLIF(p.city,''),(SELECT city FROM events WHERE host_id=u.id AND published=1 AND sample=0 ORDER BY starts_at DESC LIMIT 1),'') city,p.avatar_url,(SELECT image FROM events WHERE host_id=u.id AND published=1 AND sample=0 AND image IS NOT NULL ORDER BY starts_at DESC LIMIT 1) cover_image,(SELECT COUNT(*) FROM organizer_follows WHERE organizer_id=u.id) followers,(SELECT COUNT(*) FROM events WHERE host_id=u.id AND published=1 AND sample=0) event_count,EXISTS(SELECT 1 FROM organizer_follows WHERE organizer_id=u.id AND user_id=?1) following FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE EXISTS(SELECT 1 FROM events WHERE host_id=u.id AND published=1 AND sample=0)`;
export async function getOrganizer(id: string, viewerId: string | null) {
  return database().prepare(organizerSelect + " AND u.id=?2").bind(viewerId,id).first<Organizer>();
}
