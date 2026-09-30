import { faContent } from "@/locales/domain-fa";
import { config } from "@/db";
import { ApiError } from "@/lib/server";
import { MEDIA_KEY_PATTERN, type ImageMimeType } from "@/lib/media-policy";

function bucket() {
  const storage = config().BUCKET;
  if (!storage) throw new ApiError(503, faContent.mediaStorageUnavailable);
  return storage;
}

function checkedKey(key: string) {
  if (!MEDIA_KEY_PATTERN.test(key)) throw new Error("Invalid media storage key");
  return key;
}

export async function writeMedia(key: string, bytes: Uint8Array, contentType: ImageMimeType) {
  const result = await bucket().put(checkedKey(key), bytes, {
    httpMetadata: { contentType },
    onlyIf: { etagDoesNotMatch: "*" },
  });
  if (!result) throw Object.assign(new Error("Media storage key already exists"), { code: "EEXIST" });
}

export async function readMedia(key: string): Promise<ReadableStream<Uint8Array> | ArrayBuffer | null> {
  const object = await bucket().get(checkedKey(key));
  return object?.body ?? null;
}

export async function deleteMedia(key: string) {
  await bucket().delete(checkedKey(key));
}
