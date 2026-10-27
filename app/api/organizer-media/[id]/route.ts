import { database } from "@/db";
import { ApiError, boundary } from "@/lib/server";
import { readMedia } from "@/lib/media-storage";
import { IMAGE_MIME_TYPES, type ImageMimeType } from "@/lib/media-policy";
import { organizerAvatarCopy as t } from "@/locales/organizer-avatar-fa";
import { fastSession } from "@/lib/fast-auth";

export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => boundary(async () => {
  const media = await database().prepare(`SELECT m.storage_key,m.content_type,m.byte_size,
    EXISTS(SELECT 1 FROM events WHERE COALESCE(organizer_id,host_id)=o.id AND published=1 AND sample=0) published FROM organizer_media m
    JOIN organizers o ON o.id=m.organizer_id WHERE m.id=? AND (m.source='upload' OR m.instagram_handle=o.instagram_handle)
    `).bind((await params).id).first<{ storage_key: string; content_type: ImageMimeType; byte_size: number; published: number }>();
  if (!media || !IMAGE_MIME_TYPES.includes(media.content_type)) throw new ApiError(404, t.imageNotFound);
  if (!media.published) {
    // Editors can preview a draft's portrait without publishing its profile.
    const session = await fastSession(req.headers.get("cookie")).catch(() => null);
    if (!session) throw new ApiError(404, t.imageNotFound);
  }
  const bytes = await readMedia(media.storage_key);
  if (!bytes) throw new ApiError(404, t.imageNotFound);
  return new Response(bytes, { headers: {
    "Content-Type": media.content_type, "Content-Length": String(media.byte_size), "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox",
  } });
});
