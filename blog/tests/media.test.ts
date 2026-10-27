import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { saveImage, loadImage, isPublicImage, MAX_IMAGE_BYTES } from "../lib/media.ts";
import { readBytes, readJson } from "../lib/http.ts";
import { savePost, getDatabase } from "../lib/store.ts";

const directory = mkdtempSync(join(tmpdir(), "hg-blog-media-test-"));
process.env.BLOG_DATA_DIR = directory;
after(() => { getDatabase().close(); rmSync(directory, { recursive: true, force: true }); });

test("decode, normalize uploads and gate draft media until publication", async () => {
  const bytes = await sharp({ create: { width: 64, height: 40, channels: 3, background: "#f07f46" } }).png().toBuffer();
  const uploaded = await saveImage(bytes, "image/png");
  assert.equal(uploaded.width, 64);
  assert.match(uploaded.url, /^\/media\/[a-f0-9-]+\.webp$/);
  assert.equal(isPublicImage(uploaded.url), false);
  const stored = await loadImage(uploaded.url.split("/").at(-1)!);
  assert.ok(stored);
  assert.equal((await sharp(stored).metadata()).format, "webp");
  const post = savePost({ kind: "article", slug: "media-test", title: "آزمون تصویر", excerpt: "", body: "متن آزمون", author: "آزمون", category: "", status: "draft", publishedAt: "", coverImage: uploaded.url, coverAlt: "تصویر آزمون", seoTitle: "", seoDescription: "", canonicalUrl: "", ogTitle: "", ogDescription: "", ogImage: "", noIndex: false, featured: false });
  assert.equal(isPublicImage(uploaded.url), false);
  const published = savePost({ ...post, status: "published" }, post.id);
  assert.equal(isPublicImage(uploaded.url), true);
  savePost({ ...published, status: "draft" }, post.id);
  assert.equal(isPublicImage(uploaded.url), false);
  assert.equal(await loadImage("../../blog.sqlite"), null);
  await assert.rejects(saveImage(bytes, "image/jpeg"), /معتبر/);
  await assert.rejects(saveImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/svg+xml"));
  await assert.rejects(saveImage(Buffer.from("not an image"), "image/png"));
  await assert.rejects(saveImage(Buffer.alloc(MAX_IMAGE_BYTES + 1), "image/png"));
});

test("bounded chunked bodies reject before buffering unlimited requests", async () => {
  let pulls = 0;
  const stream = new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(1024)); } });
  const request = new Request("http://localhost/api", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  await assert.rejects(readBytes(request, 2048), /حجم/);
  assert.ok(pulls <= 5);
  await assert.rejects(readJson(new Request("http://localhost", { method: "POST", body: "{}" })), /JSON/);
  await assert.rejects(readJson(new Request("http://localhost", { method: "POST", body: "[1]", headers: { "content-type": "application/json" } })), /نامعتبر/);
});
