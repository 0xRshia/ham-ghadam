import { database } from "@/db";
import { ApiError, rateLimit } from "@/lib/server";
import { writeMedia, deleteMedia } from "@/lib/media-storage";
import type { ImageMimeType } from "@/lib/media-policy";
import { fetchInstagramAvatar, instagramAvatarConfig } from "@/lib/instagram-avatar";
import { organizerAvatarCopy as t } from "@/locales/organizer-avatar-fa";

type OrganizerIdentity = { id: string; instagram_handle: string | null };
export type OrganizerAvatar = {
  id: string; organizer_id: string; storage_key: string; content_type: ImageMimeType;
  byte_size: number; source: "upload" | "instagram"; instagram_handle: string | null; created_at: number;
};

export async function avatarOrganizer(id: string) {
  const organizer = await database().prepare("SELECT id,instagram_handle FROM organizers WHERE id=?").bind(id).first<OrganizerIdentity>();
  if (!organizer) throw new ApiError(404, t.notFound);
  return organizer;
}

export async function organizerAvatarStatus(id: string) {
  const organizer = await avatarOrganizer(id);
  const image = await database().prepare("SELECT * FROM organizer_media WHERE organizer_id=?").bind(id).first<OrganizerAvatar>();
  const current = image && (image.source === "upload" || image.instagram_handle === organizer.instagram_handle) ? image : null;
  return { url: current ? `/api/organizer-media/${current.id}` : null, source: current?.source ?? null,
    instagramConfigured: !!instagramAvatarConfig(), instagramHandle: organizer.instagram_handle };
}

export async function saveOrganizerAvatar(organizer: OrganizerIdentity, upload: { bytes: Uint8Array; contentType: ImageMimeType }, source: "upload" | "instagram") {
  const db = database();
  const id = crypto.randomUUID();
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[upload.contentType];
  const storageKey = `${id}.${extension}`;
  let wrote = false;
  let mutationAttempted = false;
  let definitelyRejected = false;
  try {
    await writeMedia(storageKey, upload.bytes, upload.contentType);
    wrote = true;
    // The organizer handle can change during the provider request. Insert only
    // against the identity read by the importer, and preserve manual uploads
    // made by another editor while an Instagram request was in flight.
    mutationAttempted = true;
    const saved = await db.prepare(`INSERT INTO organizer_media(id,organizer_id,storage_key,content_type,byte_size,source,instagram_handle,created_at)
      SELECT ?1,id,?2,?3,?4,?5,instagram_handle,?6 FROM organizers WHERE id=?7 AND (?5='upload' OR instagram_handle IS ?8)
      ON CONFLICT(organizer_id) DO UPDATE SET id=excluded.id,storage_key=excluded.storage_key,content_type=excluded.content_type,
      byte_size=excluded.byte_size,source=excluded.source,instagram_handle=excluded.instagram_handle,created_at=excluded.created_at
      WHERE excluded.source='upload' OR organizer_media.source<>'upload' RETURNING id`)
      .bind(id, storageKey, upload.contentType, upload.bytes.byteLength, source, Date.now(), organizer.id, organizer.instagram_handle).first<{ id: string }>();
    if (!saved) {
      definitelyRejected = true;
      throw new ApiError(409, t.instagramChanged);
    }
  } catch (error) {
    if (wrote && mutationAttempted && !definitelyRejected) {
      // D1 may commit a mutation then lose its response. Keep the file unless
      // non-commit is certain; deleting it could break a committed portrait or
      // an in-flight DB/media backup. A confirmed reference recovers success.
      try {
        const saved = await db.prepare("SELECT id FROM organizer_media WHERE id=? AND storage_key=?").bind(id, storageKey).first<{ id: string }>();
        if (saved) return organizerAvatarStatus(organizer.id);
      } catch { /* Preserve an uncertain object rather than corrupting data. */ }
      console.error("Organizer image outcome uncertain; preserve uploaded image", id);
    } else if (wrote || (error as { code?: string }).code !== "EEXIST") {
      await deleteMedia(storageKey).catch(() => console.error("Organizer image cleanup failed"));
    }
    throw error;
  }
  // Old files are immutable and retained for consistent DB/media backups.
  return organizerAvatarStatus(organizer.id);
}

export async function importOrganizerInstagramAvatar(id: string) {
  const organizer = await avatarOrganizer(id);
  if (!organizer.instagram_handle) throw new ApiError(400, t.instagramHandleRequired);
  const previous = await database().prepare("SELECT source,instagram_handle,created_at FROM organizer_media WHERE organizer_id=?")
    .bind(id).first<Pick<OrganizerAvatar, "source" | "instagram_handle" | "created_at">>();
  if (previous?.source === "upload") throw new ApiError(409, t.preserveUpload);
  if (previous?.instagram_handle === organizer.instagram_handle && previous.created_at > Date.now() - 86400000)
    return organizerAvatarStatus(id);
  if (!instagramAvatarConfig()) throw new ApiError(503, t.instagramNotConfigured);
  // A failed API response also consumes the cooldown, avoiding remote requests
  // on every editor render or repeated clicks. Public image reads never fetch.
  await rateLimit(`organizer-instagram-avatar:${id}`, 4, 60000);
  const image = await fetchInstagramAvatar(organizer.instagram_handle);
  return saveOrganizerAvatar(organizer, image, "instagram");
}
