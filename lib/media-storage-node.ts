import { faContent } from "@/locales/domain-fa";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { ApiError } from "@/lib/server";
import { MEDIA_KEY_PATTERN } from "@/lib/media-policy";

function directory() {
  const path = process.env.MEDIA_PATH;
  if (!path || !isAbsolute(path)) {
    throw new ApiError(503, faContent.mediaStorageUnavailable);
  }
  return path;
}

function filename(key: string) {
  if (!MEDIA_KEY_PATTERN.test(key)) throw new Error("Invalid media storage key");
  return join(directory(), key);
}

export async function writeMedia(key: string, bytes: Uint8Array) {
  const path = filename(key);
  await mkdir(directory(), { recursive: true, mode: 0o700 });
  await writeFile(path, bytes, { flag: "wx", mode: 0o600, flush: true });
}

export async function readMedia(key: string): Promise<ArrayBuffer | null> {
  try {
    const bytes = await readFile(filename(key));
    return Uint8Array.from(bytes).buffer;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function deleteMedia(key: string) {
  try {
    await unlink(filename(key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
