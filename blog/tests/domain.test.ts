import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { allPublishedPosts, closeDatabase, deletePost, getDatabase, getPost, getPostBySlug, getRedirect, getSettings, isPublished, listPosts, savePost, saveSettings } from "../lib/store.ts";
import { assertOrigin, login, logout, sessionFromToken, trustedIP } from "../lib/auth.ts";
import { hashPassword, verifyPassword } from "../lib/passwords.ts";
import { BlogError, imageUrl, safeUrl } from "../lib/validation.ts";
import { dataDirectory, origin } from "../lib/config.ts";

const directory = mkdtempSync(join(tmpdir(), "hmghadam-blog-domain-"));
process.env.BLOG_DATA_DIR = directory;
process.env.BLOG_ORIGIN = "http://localhost:9090";
process.env.BLOG_ADMIN_USERNAME = "editor";
const password = "test-only-long-password";
before(async () => { process.env.BLOG_ADMIN_PASSWORD_HASH = await hashPassword(password); });
after(() => { closeDatabase(); rmSync(directory, { recursive: true, force: true }); });

function post(slug: string, overrides: Record<string, unknown> = {}) {
  return {
    kind: "article", slug, title: "عنوان نوشته", excerpt: "خلاصهٔ نوشته", body: "## بخش نخست\n\nمتن اصلی نوشته برای آزمون.",
    author: "نویسنده", category: "فرهنگ", coverImage: "", coverAlt: "", seoTitle: "", seoDescription: "", canonicalUrl: "",
    ogTitle: "", ogDescription: "", ogImage: "", noIndex: false, featured: false, status: "draft", publishedAt: "", ...overrides,
  };
}

function status(expected: number) {
  return (error: unknown) => error instanceof BlogError && error.status === expected;
}

test("fresh database contains real homepage settings and no fabricated articles", () => {
  assert.equal(listPosts().total, 0);
  assert.equal(getSettings().siteName, "هم‌قدم");
  assert.equal(getDatabase().prepare("PRAGMA user_version").get()?.user_version, 1);
  assert.equal(getDatabase().prepare("PRAGMA journal_mode").get()?.journal_mode, "wal");
});

test("drafts and scheduled articles stay out of all public queries", () => {
  const draft = savePost(post("draft-visibility"));
  const future = savePost(post("future-visibility", { status: "published", publishedAt: "2099-01-01T00:00:00Z" }));
  const published = savePost(post("published-visibility", { status: "published" }));
  assert.equal(isPublished(draft), false);
  assert.equal(isPublished(future), false);
  assert.equal(isPublished(published), true);
  assert.equal(listPosts({ publishedOnly: true }).total, 1);
  assert.deepEqual(allPublishedPosts().map(value => value.id), [published.id]);
});

test("article revisions reject stale writes and preserve existing publication time", () => {
  const first = savePost(post("version-check", { status: "published" }));
  const second = savePost({ ...first, title: "عنوان ویرایش‌شده", publishedAt: "" }, first.id);
  assert.equal(second.version, 2);
  assert.equal(second.publishedAt, first.publishedAt);
  assert.throws(() => savePost({ ...first, title: "بازنویسی قدیمی" }, first.id), status(409));
  assert.throws(() => deletePost(first.id, first.version), status(409));
  assert.equal(getPost(first.id)?.title, second.title);
});

test("slug histories redirect directly, reserve old paths, and hide unpublished targets", () => {
  const first = savePost(post("first-slug", { status: "published" }));
  const second = savePost({ ...first, slug: "second-slug" }, first.id);
  const third = savePost({ ...second, slug: "third-slug" }, first.id);
  assert.equal(getRedirect("article", "first-slug")?.slug, "third-slug");
  assert.equal(getRedirect("article", "second-slug")?.slug, "third-slug");
  assert.equal(getPostBySlug("article", "first-slug"), null);
  assert.throws(() => savePost(post("first-slug")), status(409));
  const draft = savePost({ ...third, status: "draft" }, third.id);
  assert.equal(getRedirect("article", "first-slug"), null);
  const restored = savePost({ ...draft, slug: "first-slug", status: "published" }, draft.id);
  assert.equal(getRedirect("article", "first-slug"), null);
  assert.equal(getRedirect("article", "third-slug")?.slug, "first-slug");
  deletePost(restored.id, restored.version);
  assert.equal(getRedirect("article", "third-slug"), null);
});

test("Persian slugs normalize and duplicates, invalid publishing and unsafe URLs are rejected", () => {
  const saved = savePost(post("تجربه‌های-تازه"));
  assert.equal(getPostBySlug("article", "تجربه‌های-تازه")?.id, saved.id);
  assert.throws(() => savePost(post("تجربه‌های-تازه")), status(409));
  assert.throws(() => savePost(post("../admin")), status(400));
  assert.throws(() => savePost(post("empty-published", { status: "published", body: "" })), status(400));
  assert.throws(() => savePost(post("cover-no-alt", { coverImage: "/apple-touch-icon.png", coverAlt: "" })), status(400));
  assert.throws(() => savePost(post("unsafe-canonical", { canonicalUrl: "javascript:alert(1)" })), status(400));
  assert.throws(() => savePost(post("canonical-fragment", { canonicalUrl: "https://example.com/#section" })), status(400));
  assert.throws(() => savePost(post("future-overflow", { status: "published", publishedAt: "9999-12-31T23:59:00-23:59" })), status(400));
  assert.throws(() => savePost(post("past-overflow", { status: "published", publishedAt: "0000-01-01T00:00:00+23:59" })), status(400));
  assert.throws(() => imageUrl("https://tracker.example/image.png"), status(400));
  assert.throws(() => safeUrl("//evil.example", true), status(400));
  assert.throws(() => safeUrl("https://user:password@example.com"), status(400));
  assert.throws(() => safeUrl("/\\evil.example", true), status(400));
});

test("queries bind user input, filter kinds and categories, and paginate", () => {
  const first = savePost(post("query-one", { title: "جستجوی مشخص", category: "آزمون", status: "published" }));
  savePost(post("query-two", { title: "جستجوی مشخص دوم", category: "آزمون", status: "published" }));
  savePost(post("query-page", { kind: "page", title: "جستجوی مشخص صفحه", category: "آزمون", status: "published" }));
  const result = listPosts({ kind: "article", query: "جستجوی مشخص", category: "آزمون", pageSize: 1 });
  assert.equal(result.total, 2);
  assert.equal(result.posts.length, 1);
  assert.equal(listPosts({ query: "' OR 1=1 --" }).total, 0);
  assert.equal(listPosts({ kind: "article", query: "جستجوی مشخص", category: "آزمون", page: 3, pageSize: 1 }).posts.length, 0);
  assert.equal(getPost(first.id)?.title, "جستجوی مشخص");
});

test("homepage edits persist across reopen and stale or unsafe updates fail", () => {
  const initial = getSettings();
  const saved = saveSettings({ ...initial, heroTitle: "صفحهٔ اصلی ویرایش‌شده", noIndex: true });
  assert.throws(() => saveSettings(initial), status(409));
  assert.throws(() => saveSettings({ ...saved, navLinks: [{ label: "خطر", href: "data:text/html,x" }] }), status(400));
  assert.throws(() => saveSettings({ ...saved, logoUrl: "" }), status(400));
  assert.throws(() => saveSettings({ ...saved, ctaUrl: "" }), status(400));
  assert.throws(() => saveSettings({ ...saved, ctaLabel: "" }), status(400));
  closeDatabase();
  assert.equal(getSettings().heroTitle, saved.heroTitle);
  assert.equal(getSettings().noIndex, true);
  assert.ok(listPosts().total > 0);
});

test("scrypt credentials issue hashed sessions, support logout, expiry and credential rotation", async () => {
  assert.equal(await verifyPassword(password, process.env.BLOG_ADMIN_PASSWORD_HASH!), true);
  assert.equal(await verifyPassword("wrong", process.env.BLOG_ADMIN_PASSWORD_HASH!), false);
  await assert.rejects(login("wrong-user", password, "203.0.113.1"), status(401));
  const token = await login("editor", password, "203.0.113.1");
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.ok(sessionFromToken(token));
  const hash = createHash("sha256").update(token).digest("hex");
  assert.ok(getDatabase().prepare("SELECT hash FROM sessions WHERE hash=?").get(hash));
  assert.equal(getDatabase().prepare("SELECT hash FROM sessions WHERE hash=?").get(token), undefined);
  logout(token);
  assert.equal(sessionFromToken(token), null);
  const expiring = await login("editor", password, "203.0.113.1");
  getDatabase().prepare("UPDATE sessions SET expires_at=?").run(Date.now() - 1);
  assert.equal(sessionFromToken(expiring), null);
  const rotated = await login("editor", password, "203.0.113.2");
  process.env.BLOG_ADMIN_USERNAME = "new-editor";
  assert.equal(sessionFromToken(rotated), null);
  process.env.BLOG_ADMIN_USERNAME = "editor";
});

test("login attempt limits persist and unconfigured admin fails closed", async () => {
  const key = `ip:${createHash("sha256").update("203.0.113.50").digest("hex")}`;
  const before = Date.now();
  for (let index = 0; index < 3; index++) await assert.rejects(login(`wrong-${index}`, "wrong", "203.0.113.50"), status(401));
  const limit = getDatabase().prepare("SELECT attempts,expires_at FROM login_limits WHERE key=?").get(key)!;
  assert.equal(limit.attempts, 3);
  assert.ok(Number(limit.expires_at) >= before + 3_600_000 && Number(limit.expires_at) <= Date.now() + 3_600_000);
  await assert.rejects(login("editor", password, "203.0.113.50"), status(429));
  assert.equal(getDatabase().prepare("SELECT expires_at FROM login_limits WHERE key=?").get(key)?.expires_at, limit.expires_at);
  closeDatabase();
  await assert.rejects(login("editor", password, "203.0.113.50"), status(429));
  assert.ok(await login("editor", password, "203.0.113.51"));
  getDatabase().prepare("UPDATE login_limits SET expires_at=? WHERE key=?").run(Date.now(), key);
  assert.ok(await login("editor", password, "203.0.113.50"));
  assert.equal(getDatabase().prepare("SELECT attempts FROM login_limits WHERE key=?").get(key)?.attempts, 1);
  const hash = process.env.BLOG_ADMIN_PASSWORD_HASH;
  delete process.env.BLOG_ADMIN_PASSWORD_HASH;
  await assert.rejects(login("editor", password, "203.0.113.51"), status(503));
  assert.equal(sessionFromToken(null), null);
  process.env.BLOG_ADMIN_PASSWORD_HASH = hash;
});

test("successful logins count toward the limit and existing sessions remain usable", async () => {
  const token = await login("editor", password, "203.0.113.52");
  await login("editor", password, "203.0.113.52");
  await login("editor", password, "203.0.113.52");
  await assert.rejects(login("editor", password, "203.0.113.52"), status(429));
  assert.ok(sessionFromToken(token));
});

test("concurrent malformed login attempts cannot exceed three per IP", async () => {
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => login(null, null, "203.0.113.53")));
  const statuses = results.map(result => result.status === "rejected" && result.reason instanceof BlogError ? result.reason.status : 200).sort();
  assert.deepEqual(statuses, [401, 401, 401, 429, 429, 429, 429, 429]);
});

test("Next env loader preserves an escaped scrypt hash in .env.local", () => {
  const environmentDirectory = join(directory, "next-env-loader");
  mkdirSync(environmentDirectory);
  const hash = process.env.BLOG_ADMIN_PASSWORD_HASH!;
  writeFileSync(join(environmentDirectory, ".env.local"), `BLOG_ADMIN_PASSWORD_HASH='${hash.replace(/\$/g, "\\$")}'\n`);
  const environment: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development", EXPECTED_HASH: hash };
  delete environment.BLOG_ADMIN_PASSWORD_HASH;
  delete environment.__NEXT_PROCESSED_ENV;
  const result = spawnSync(process.execPath, ["-e", "require('@next/env').loadEnvConfig(process.argv[1]);if(process.env.BLOG_ADMIN_PASSWORD_HASH!==process.env.EXPECTED_HASH)process.exit(1)", environmentDirectory], { env: environment });
  assert.equal(result.status, 0, result.stderr.toString());
});

test("backup preserves WAL-backed records and media, rejecting missing media without completing a snapshot", async () => {
  const destination = mkdtempSync(join(tmpdir(), "hmghadam-blog-backup-"));
  const { default: sharp } = await import("sharp");
  const mediaName = `${randomUUID()}.webp`;
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#f07f46" } }).webp().toBuffer();
  mkdirSync(join(directory, "media"));
  writeFileSync(join(directory, "media", mediaName), bytes);
  const saved = savePost(post("backup-test", { coverImage: `/media/${mediaName}`, coverAlt: "تصویر آزمون پشتیبان" }));
  const run = (backupDirectory: string) => spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/backup.ts", import.meta.url))], {
    env: { ...process.env, BLOG_BACKUP_DIR: backupDirectory }, timeout: 15000,
  });
  try {
    const successful = run(destination);
    assert.equal(successful.status, 0, successful.stderr.toString());
    const summary = JSON.parse(successful.stdout.toString()) as { backup: string; media: number; posts: number };
    assert.equal(summary.media, 1);
    assert.equal(summary.posts, listPosts().total);
    assert.deepEqual(readFileSync(join(summary.backup, "media", mediaName)), bytes);
    const copied = new DatabaseSync(join(summary.backup, "blog.sqlite"), { readOnly: true });
    assert.equal(copied.prepare("SELECT id FROM posts WHERE id=?").get(saved.id)?.id, saved.id);
    copied.close();
    const manifest = JSON.parse(readFileSync(join(summary.backup, "manifest.json"), "utf8"));
    assert.equal(manifest.checksums[`media/${mediaName}`], createHash("sha256").update(bytes).digest("hex"));
    assert.notEqual(run(join(directory, "nested-backup")).status, 0);
    const missing = savePost(post("backup-missing-media", { coverImage: `/media/${randomUUID()}.webp`, coverAlt: "تصویر حذف‌شده" }));
    const failure = run(destination);
    assert.notEqual(failure.status, 0);
    assert.match(failure.stderr.toString(), /Referenced media is missing/);
    assert.equal(readdirSync(destination).length, 1);
    deletePost(missing.id, missing.version);
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
});

test("origins and proxy IP trust use configured authority only", () => {
  assert.doesNotThrow(() => assertOrigin(new Request("http://localhost:9090/api", { headers: { origin: "http://localhost:9090" } })));
  assert.throws(() => assertOrigin(new Request("http://localhost:9090/api")), status(403));
  assert.throws(() => assertOrigin(new Request("http://localhost:9090/api", { headers: { origin: "https://evil.example" } })), status(403));
  const request = new Request("http://localhost:9090", { headers: { "x-real-ip": "203.0.113.3", "cf-connecting-ip": "203.0.113.4" } });
  delete process.env.BLOG_TRUST_PROXY;
  assert.equal(trustedIP(request), "local");
  process.env.BLOG_TRUST_PROXY = "1";
  assert.equal(trustedIP(request), "203.0.113.3");
  assert.equal(trustedIP(new Request("http://localhost:9090", { headers: { "x-real-ip": "203.0.113.3,evil" } })), "local");
  delete process.env.BLOG_TRUST_PROXY;
});

test("production config rejects insecure or missing origins and relative data directories", () => {
  const environment = process.env as Record<string, string | undefined>;
  const previousEnvironment = environment.NODE_ENV;
  environment.NODE_ENV = "production";
  assert.equal(origin(), "http://localhost:9090");
  process.env.BLOG_ORIGIN = "http://127.0.0.1:9090";
  assert.equal(origin(), "http://127.0.0.1:9090");
  process.env.BLOG_ORIGIN = "http://[::1]:9090";
  assert.equal(origin(), "http://[::1]:9090");
  process.env.BLOG_ORIGIN = "http://hmghadam.com";
  assert.throws(() => origin(), /HTTPS/);
  delete process.env.BLOG_ORIGIN;
  assert.throws(() => origin(), /configured/);
  process.env.BLOG_ORIGIN = "https://hmghadam.com";
  assert.equal(origin(), "https://hmghadam.com");
  process.env.BLOG_DATA_DIR = "relative";
  assert.throws(() => dataDirectory(), /absolute/);
  process.env.BLOG_DATA_DIR = directory;
  process.env.BLOG_ORIGIN = "http://localhost:9090";
  if (previousEnvironment === undefined) delete environment.NODE_ENV;
  else environment.NODE_ENV = previousEnvironment;
});
