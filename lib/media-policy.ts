export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_EVENT_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_EVENT_REQUEST_BYTES = 21 * 1024 * 1024;
export const MAX_GALLERY_IMAGES = 6;
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const IMAGE_FILE_ACCEPT = [...IMAGE_MIME_TYPES, ".jpg", ".jpeg", ".png", ".webp"].join(",");
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

export function hasGenericFileType(type: string) {
  return type === "" || type.toLowerCase() === "application/octet-stream";
}

export function isImageFileSelection(file: Pick<File, "name" | "type">) {
  return IMAGE_MIME_TYPES.some(type => type === file.type.toLowerCase()) ||
    (hasGenericFileType(file.type) && /\.(jpe?g|png|webp)$/i.test(file.name));
}

export function imageFileError(name: string, reason: string) {
  // Strip control characters (including bidi overrides) from untrusted filenames.
  const label = name.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "").slice(0, 120);
  return label ? `فایل «${label}»: ${reason}` : reason;
}

export const MEDIA_KEY_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(?:jpg|png|webp)$/;
