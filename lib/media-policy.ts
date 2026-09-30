export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_EVENT_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_EVENT_REQUEST_BYTES = 21 * 1024 * 1024;
export const MAX_GALLERY_IMAGES = 6;
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

export const MEDIA_KEY_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(?:jpg|png|webp)$/;
