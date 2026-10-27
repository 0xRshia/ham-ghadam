import sharp from "sharp";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "./config.ts";
import { allPublishedPosts, getSettings } from "./store.ts";
import { BlogError } from "./validation.ts";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const mediaName = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/;
let processing = 0;

export async function saveImage(bytes: Buffer, contentType: string) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new BlogError(413, "حداکثر حجم تصویر ۵ مگابایت است.");
  const expected = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" }[contentType];
  if (!expected) throw new BlogError(415, "تصویر باید JPEG، PNG یا WebP باشد.");
  if (processing >= 2) throw new BlogError(429, "پردازش تصویر دیگری در جریان است. دوباره تلاش کنید.");
  processing++;
  try {
    const image = sharp(bytes, { failOn: "warning", limitInputPixels: 24_000_000 });
    const metadata = await image.metadata();
    if (metadata.format !== expected || (metadata.pages || 1) > 1 || !metadata.width || !metadata.height) throw new BlogError(415, "فایل باید یک تصویر ثابت معتبر باشد.");
    // Decode and reencode, stripping metadata and never serving uploaded bytes directly.
    const { data, info } = await image.rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    const name = `${randomUUID()}.webp`;
    const directory = join(dataDirectory(), "media");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(join(directory, name), data, { flag: "wx", mode: 0o600, flush: true });
    return { url: `/media/${name}`, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof BlogError) throw error;
    if (error instanceof Error && "code" in error) throw error;
    throw new BlogError(415, "تصویر قابل پردازش نیست یا ابعاد آن بیش از حد مجاز است.");
  } finally { processing--; }
}

export function isPublicImage(url: string) {
  const settings = getSettings();
  if ([settings.logoUrl, settings.socialImage].includes(url) || settings.homeBody.includes(url)) return true;
  return allPublishedPosts().some(post => post.coverImage === url || post.ogImage === url || post.body.includes(url));
}

export async function assertReferencedImages(body: string, images: string[]) {
  const references = new Set([...images, ...[...body.matchAll(/\/media\/([a-f0-9-]{36}\.webp)/g)].map(match => match[0])]);
  for (const url of references) {
    if (!url.startsWith("/media/")) continue;
    const name = url.slice(7);
    if (!mediaName.test(name)) throw new BlogError(400, "نشانی تصویر معتبر نیست.");
    try { if (!(await stat(join(dataDirectory(), "media", name))).isFile()) throw new Error("Not a file"); }
    catch { throw new BlogError(400, "تصویر انتخاب‌شده پیدا نشد؛ تصویر را دوباره بارگذاری کنید."); }
  }
}

export async function loadImage(name: string) {
  if (!mediaName.test(name)) return null;
  try { return await readFile(join(dataDirectory(), "media", name)); }
  catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null; throw error; }
}
