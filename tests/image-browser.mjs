import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "image-browser-"));
const origin = "http://127.0.0.1:5194";
const env = { ...process.env, DATABASE_PATH: path.join(directory, "db.sqlite"), MEDIA_PATH: path.join(directory, "media"), APP_ORIGIN: origin, HOST: "127.0.0.1", PORT: "5194", SEED_SAMPLE_EVENTS: "false" };
assert.equal(spawnSync(process.execPath, ["scripts/migrate-node.mjs"], { env }).status, 0);
const db = new DatabaseSync(env.DATABASE_PATH);
const id = crypto.randomUUID(), mediaId = crypto.randomUUID(), key = `${crypto.randomUUID()}.png`;
fs.mkdirSync(env.MEDIA_PATH);
const source = fs.readFileSync("public/illustrations/events-light.png");
fs.writeFileSync(path.join(env.MEDIA_PATH, key), source);
db.prepare("INSERT INTO events(id,title,description,category,venue,address,city,price,published,sample,starts_at,ends_at,image) VALUES(?,?,?,?,?,?,?,0,1,0,?,?,?)")
  .run(id, "آزمون تصویر", "بررسی تصویر واقعی در پایگاه ایزوله", "books", "محل آزمون", "نشانی", "تهران", Date.now() + 86400000, Date.now() + 90000000, `/api/media/${mediaId}`);
db.prepare("INSERT INTO event_media(id,event_id,storage_key,content_type,byte_size,role,position,created_at) VALUES(?,?,?,?,?,'cover',0,?)")
  .run(mediaId, id, key, "image/png", source.length, Date.now());
const server = spawn(process.execPath, ["dist/standalone/server.js"], { env, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
for (const stream of [server.stdout, server.stderr]) stream.on("data", chunk => { output += chunk; });
let browser;
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${origin}/api/health`)).ok) break; } catch {}
    if (server.exitCode !== null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${origin}/events/${id}`);
    await page.waitForFunction(() => {
      const image = document.querySelector(".el-detail-hero > img");
      return image?.complete && image.naturalWidth > 0;
    });
    const image = await page.locator(".el-detail-hero > img").evaluate(image => ({ src: image.currentSrc, loading: image.loading, priority: image.fetchPriority, width: image.naturalWidth }));
    assert.match(image.src, /\?w=\d+&v=1$/);
    assert.equal(image.loading, "eager");
    assert.equal(image.priority, "high");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const response = await fetch(image.src);
    assert.equal(response.headers.get("content-type"), "image/webp");
    assert.ok((await response.arrayBuffer()).byteLength < source.length);
    assert.equal((await fetch(image.src, { headers: { "If-None-Match": response.headers.get("etag") } })).status, 304);
  }
  await page.goto(`${origin}/events`);
  await page.locator(".el-category-3d img").first().waitFor();
  await page.waitForFunction(() => document.querySelector(".el-category-3d img")?.naturalWidth > 0);
  assert.match(await page.locator(".el-category-3d img").first().evaluate(image => image.currentSrc), /\/optimized\/.+\.webp$/);
  assert.equal(await page.locator('.el-category-3d img[loading="lazy"]').count() > 0, true);
  assert.deepEqual(errors, []);
  console.log("PASS localhost production browser: mobile/desktop RTL, optimized media, high-priority hero, static WebP banners, lazy loading, cache revalidation and no page errors");
} catch (error) { console.error(output.slice(-4000)); throw error; }
finally {
  await browser?.close();
  if (server.exitCode === null) { const stopped = new Promise(resolve => server.once("exit", resolve)); server.kill("SIGTERM"); await stopped; }
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
