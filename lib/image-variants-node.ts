import sharp from "sharp";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { IMAGE_WIDTHS, IMAGE_VARIANT_VERSION } from "@/lib/image-policy";
import { MEDIA_KEY_PATTERN } from "@/lib/media-policy";
import { ApiError } from "@/lib/server";

const CACHE_BYTES = 256 * 1024 * 1024;
export const imageVariantsSupported = true;
const pending = new Map<string, Promise<ArrayBuffer | null>>();
let queue = Promise.resolve();

async function read(path: string) {
  try { return await readFile(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function trimCache(directory: string, incomingBytes: number) {
  const entries = await Promise.all((await readdir(directory)).filter(name => name.endsWith(".webp")).map(async name => {
    const path = join(directory, name);
    try { return { path, ...await stat(path) }; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }));
  const files = entries.filter(item => item !== null).sort((a, b) => a.mtimeMs - b.mtimeMs);
  let total = files.reduce((size, file) => size + file.size, incomingBytes);
  for (const file of files) {
    if (total <= CACHE_BYTES) break;
    await unlink(file.path).catch(error => { if (error.code !== "ENOENT") throw error; });
    total -= file.size;
  }
}

export async function readImageVariant(key: string, width: number): Promise<ArrayBuffer | null> {
  const root = process.env.MEDIA_PATH;
  if (!root || !isAbsolute(root)) throw new ApiError(503, "ذخیره‌سازی رسانه در دسترس نیست.");
  if (!MEDIA_KEY_PATTERN.test(key) || !(IMAGE_WIDTHS as readonly number[]).includes(width)) throw new ApiError(400, "اندازهٔ تصویر نامعتبر است.");
  const original = join(root, key);
  // Never resurrect a deleted original from its derivative cache.
  try { await stat(original); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const directory = join(root, ".image-cache");
  const destination = join(directory, `${key}-v${IMAGE_VARIANT_VERSION}-${width}.webp`);
  const cached = await read(destination);
  if (cached) return Uint8Array.from(cached).buffer;
  const existing = pending.get(destination);
  if (existing) return existing;
  if (pending.size >= 16) throw new ApiError(503, "پردازش تصویر مشغول است؛ دوباره تلاش کنید.");
  // Serialize cold transforms to bound decoder memory; identical requests share work.
  const work = queue.then(async () => {
    const bytes = await sharp(original, { limitInputPixels: 40_000_000, animated: true })
      .autoOrient().resize({ width, withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 }).toBuffer();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await trimCache(directory, bytes.byteLength);
    const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
      await rename(temporary, destination);
    } finally {
      await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
    }
    return Uint8Array.from(bytes).buffer;
  });
  pending.set(destination, work);
  queue = work.then(() => {}, () => {});
  try { return await work; } finally { pending.delete(destination); }
}
