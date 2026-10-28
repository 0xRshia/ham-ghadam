import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Originals are design/source assets. Only these checked-in derivatives ship in the UI.
const sources = [
  ...["art", "books", "coffee", "games", "music", "halloween-v2"].map(name => `banners/${name}.webp`),
  ...(await readdir("public/illustrations")).filter(name => name.endsWith(".png")).map(name => `illustrations/${name}`),
  ...["books", "cafe", "games", "pottery"].map(name => `images/${name}.jpg`),
  ...["halloween", "music", "painting"].map(name => `images/events/${name}.webp`),
];
await mkdir("public/optimized", { recursive: true });
const manifest = {};
let originalBytes = 0, optimizedBytes = 0;
for (const source of sources) {
  const input = await readFile(`public/${source}`);
  const widths = source.startsWith("illustrations/") ? [180, 360] : [384, 640, 960];
  const variants = [];
  for (const width of widths) {
    const { data, info } = await sharp(input).autoOrient().resize({ width, withoutEnlargement: true })
      .webp({ quality: 80, effort: 6 }).toBuffer({ resolveWithObject: true });
    if (variants.some(item => item.width === info.width)) continue;
    const hash = createHash("sha256").update(data).digest("hex").slice(0, 12);
    const filename = `${source.replaceAll("/", "-").replace(/\.[^.]+$/, "")}-${info.width}-${hash}.webp`;
    await writeFile(path.join("public/optimized", filename), data);
    variants.push({ src: `/optimized/${filename}`, width: info.width });
  }
  manifest[`/${source}`] = variants;
  originalBytes += input.length;
  optimizedBytes += (await readFile(`public${variants.at(-1).src}`)).length;
}
await writeFile("lib/static-image-manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`Static images (largest variants): ${originalBytes} → ${optimizedBytes} bytes (${Math.round(100 * (1 - optimizedBytes / originalBytes))}% smaller)`);
