import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { readMedia } from "@/lib/media-storage";
import { IMAGE_MIME_TYPES, type ImageMimeType } from "@/lib/media-policy";
import { ApiError, boundary } from "@/lib/server";

export const GET = (
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) => boundary(async () => {
  const { id } = await params;
  const media = await database().prepare(
    "SELECT m.storage_key,m.content_type,m.byte_size FROM event_media m JOIN events e ON e.id=m.event_id WHERE m.id=?",
  ).bind(id).first<{ storage_key: string; content_type: ImageMimeType; byte_size: number }>();
  if (!media || !IMAGE_MIME_TYPES.includes(media.content_type)) {
    throw new ApiError(404, faContent.imageNotFound);
  }
  const image = await readMedia(media.storage_key);
  if (!image) throw new ApiError(404, faContent.imageNotFound);
  // Promotional media remains public when a host pauses ticket sales.
  return new Response(image, {
    headers: {
      "Content-Type": media.content_type,
      "Content-Length": String(media.byte_size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});
