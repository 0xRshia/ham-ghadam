import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, truncate, unlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { nodeSourceModules } from "./node-source-module.mjs";

const directory = await mkdtemp(path.join(os.tmpdir(), "image-delivery-"));
process.env.MEDIA_PATH = path.join(directory, "media");
process.env.DATABASE_PATH = path.join(directory, "app.sqlite");
const load = nodeSourceModules(path.join(directory, "modules"));
try {
  const { readImageVariant } = await load("lib/image-variants-node.ts");
  const { imageResponse } = await load("lib/image-response.ts");
  await mkdir(process.env.MEDIA_PATH);
  const key = `${crypto.randomUUID()}.png`;
  const source = await readFile("public/illustrations/events-light.png");
  await writeFile(path.join(process.env.MEDIA_PATH, key), source);
  const media = { storage_key: key, content_type: "image/png", byte_size: source.length };
  const request = (query = "", headers) => new Request(`http://localhost/api/media/test${query}`, { headers });
  const original = await imageResponse(request(), media, "immutable");
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), source);
  const responses = await Promise.all(Array.from({ length: 5 }, () => imageResponse(request("?w=384&v=1"), media, "immutable")));
  const first = responses[0];
  const bytes = Buffer.from(await first.arrayBuffer());
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 384);
  assert.equal(metadata.hasAlpha, true);
  assert.ok(bytes.length < source.length);
  assert.equal(first.headers.get("content-type"), "image/webp");
  assert.equal(first.headers.get("content-length"), String(bytes.length));
  assert.match(first.headers.get("cache-control"), /immutable/);
  for (const response of responses.slice(1)) assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  const cache = path.join(process.env.MEDIA_PATH, ".image-cache");
  assert.equal((await readdir(cache)).length, 1, "Concurrent requests generate one atomic cache file");
  const cachedPath = path.join(cache, (await readdir(cache))[0]);
  const before = await stat(cachedPath);
  assert.deepEqual(Buffer.from(await readImageVariant(key, 384)), bytes);
  assert.equal((await stat(cachedPath)).mtimeMs, before.mtimeMs, "Warm requests reuse disk output");
  const conditional = await imageResponse(request("?w=384&v=1", { "If-None-Match": `"other", W/${first.headers.get("etag")}` }), media, "immutable");
  assert.equal(conditional.status, 304);
  assert.equal((await conditional.arrayBuffer()).byteLength, 0);
  const privateImage = await imageResponse(request("?w=384&v=1", { "If-None-Match": first.headers.get("etag") }), media, "private");
  assert.equal(privateImage.status, 200);
  assert.equal(privateImage.headers.get("cache-control"), "private, no-store");
  const revalidate = await imageResponse(request(), media, "revalidate");
  assert.equal(revalidate.headers.get("cache-control"), "private, no-cache");
  assert.equal(revalidate.headers.get("vary"), "Cookie");
  for (const query of ["?w=0&v=1", "?w=99999&v=1", "?w=384", "?w=384&v=2", "?w=0384&v=1", "?w=384&w=640&v=1"]) {
    await assert.rejects(imageResponse(request(query), media, "immutable"), error => error.status === 400);
  }
  await assert.rejects(readImageVariant("../../private.png", 384), error => error.status === 400);
  await unlink(path.join(process.env.MEDIA_PATH, key));
  assert.equal(await readImageVariant(key, 384), null, "Deleted source cannot be served from derivative cache");
  const smallKey = `${crypto.randomUUID()}.png`;
  await writeFile(path.join(process.env.MEDIA_PATH, smallKey), await sharp(source).resize(50).png().toBuffer());
  assert.equal((await sharp(Buffer.from(await readImageVariant(smallKey, 384))).metadata()).width, 50, "Small originals are not enlarged");
  const oldCacheFile = path.join(cache, "old.webp");
  await writeFile(oldCacheFile, "");
  await truncate(oldCacheFile, 256 * 1024 * 1024);
  await utimes(oldCacheFile, new Date(0), new Date(0));
  await readImageVariant(smallKey, 192);
  await assert.rejects(stat(oldCacheFile), { code: "ENOENT" }, "Evicts oldest entries to keep disk usage bounded");
  const manifest = JSON.parse(await readFile("lib/static-image-manifest.json", "utf8"));
  for (const variants of Object.values(manifest)) {
    for (const variant of variants) {
      const image = await sharp(`public${variant.src}`).metadata();
      assert.equal(image.format, "webp");
      assert.equal(image.width, variant.width);
    }
  }
  console.log(`PASS image delivery: ${source.length} → ${bytes.length} bytes; dimensions, alpha, concurrency, disk reuse, 304, private policy, input limits and missing originals`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
