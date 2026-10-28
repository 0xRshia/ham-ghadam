import { readMedia } from "@/lib/media-storage";
import { imageVariantsSupported, readImageVariant } from "@/lib/image-variants";
import { IMAGE_WIDTHS, IMAGE_VARIANT_VERSION } from "@/lib/image-policy";
import type { ImageMimeType } from "@/lib/media-policy";
import { ApiError } from "@/lib/server";
import { faContent } from "@/locales/domain-fa";

type Media = { storage_key: string; content_type: ImageMimeType; byte_size: number };

// Call only after the route has checked current existence and authorization.
export async function imageResponse(req: Request, media: Media, policy: "immutable" | "revalidate" | "private") {
  const params = new URL(req.url).searchParams;
  const value = params.get("w");
  const width = value === null ? null : Number(value);
  if (width !== null && !imageVariantsSupported) throw new ApiError(400, "تغییر اندازهٔ تصویر در این محیط فعال نیست.");
  if (width !== null && (String(width) !== value || !(IMAGE_WIDTHS as readonly number[]).includes(width) || params.getAll("w").length !== 1 || params.get("v") !== IMAGE_VARIANT_VERSION || params.getAll("v").length !== 1)) {
    throw new ApiError(400, "اندازه یا نسخهٔ تصویر نامعتبر است.");
  }
  const etag = `"${media.storage_key}-${width === null ? "original" : `v${IMAGE_VARIANT_VERSION}-${width}`}"`;
  const headers = new Headers({
    "Content-Type": width === null ? media.content_type : "image/webp",
    "Cache-Control": policy === "immutable" ? "public, max-age=31536000, immutable" : policy === "private" ? "private, no-store" : "private, no-cache",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    ETag: etag,
    ...(policy !== "immutable" ? { Vary: "Cookie" } : {}),
  });
  if (policy !== "private" && req.headers.get("if-none-match")?.split(",").some(value => value.trim().replace(/^W\//, "") === etag || value.trim() === "*")) {
    return new Response(null, { status: 304, headers });
  }
  const bytes = width === null ? await readMedia(media.storage_key) : await readImageVariant(media.storage_key, width);
  if (!bytes) throw new ApiError(404, faContent.imageNotFound);
  headers.set("Content-Length", String(bytes instanceof ArrayBuffer ? bytes.byteLength : media.byte_size));
  return new Response(bytes, { headers });
}
