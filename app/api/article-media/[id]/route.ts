import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { readMedia } from "@/lib/media-storage";
import { IMAGE_MIME_TYPES, type ImageMimeType } from "@/lib/media-policy";
import { ApiError, boundary, requireAdmin } from "@/lib/server";

export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => boundary(async () => {
  const { id } = await params;
  const media = await database().prepare(
    "SELECT m.storage_key,m.content_type,m.byte_size,a.status,a.published_at FROM article_media m JOIN articles a ON a.id=m.article_id WHERE m.id=?",
  ).bind(id).first<{ storage_key: string; content_type: ImageMimeType; byte_size: number; status: string; published_at: number | null }>();
  if (!media || !IMAGE_MIME_TYPES.includes(media.content_type)) throw new ApiError(404, faContent.imageNotFound);
  const isPublic = media.status === "published" && media.published_at !== null;
  if (!isPublic) await requireAdmin(req);
  const image = await readMedia(media.storage_key);
  if (!image) throw new ApiError(404, faContent.imageNotFound);
  return new Response(image, { headers: {
    "Content-Type": media.content_type,
    "Content-Length": String(media.byte_size),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  } });
});
