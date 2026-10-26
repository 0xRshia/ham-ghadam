import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { databasePath, dataDirectory } from "./config.ts";
import type { Post, SiteSettings } from "./types.ts";
import { BlogError, objectInput, postInput, settingsInput, versionInput } from "./validation.ts";

type DatabaseState = { path: string; connection: DatabaseSync };
const globalDatabase = globalThis as typeof globalThis & { __hamghadamBlogDatabase?: DatabaseState };

function initialSettings(): SiteSettings {
  return {
    siteName: "هم‌قدم",
    tagline: "برای تجربه‌های تازه، هم‌قدم شو",
    heroEyebrow: "مجلهٔ هم‌قدم",
    heroTitle: "از خواندن تا تجربه کردن، یک قدم فاصله است",
    heroDescription: "اینجا دربارهٔ رویدادها، تجربه‌های جمعی و کشف فرصت‌های تازه می‌خوانیم. برای دیدن رویدادهای پیش رو، وارد برنامهٔ هم‌قدم شوید.",
    homeBody: "",
    ctaLabel: "کشف رویدادها",
    ctaUrl: "https://app.hmghadam.com",
    articlesTitle: "تازه‌ترین نوشته‌ها",
    emptyMessage: "هنوز نوشته‌ای منتشر نشده است.",
    footerText: "هم‌قدم، همراه شما برای کشف رویدادها و تجربه‌های تازه.",
    navLinks: [{ label: "خانه", href: "/" }, { label: "مجله", href: "/blog" }, { label: "کشف رویدادها", href: "https://app.hmghadam.com" }],
    seoTitle: "مجله هم‌قدم | رویدادها و تجربه‌های تازه",
    seoDescription: "مجلهٔ هم‌قدم؛ نوشته‌هایی دربارهٔ رویدادها، تجربه‌های جمعی و فرصت‌های تازه برای با هم بودن.",
    canonicalUrl: "",
    ogTitle: "",
    ogDescription: "",
    socialImage: "/apple-touch-icon.png",
    logoUrl: "/brand/hamghadam-wordmark.svg",
    organizationName: "هم‌قدم",
    googleVerification: "",
    noIndex: false,
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}

export function getDatabase() {
  const path = databasePath();
  if (globalDatabase.__hamghadamBlogDatabase?.path === path) return globalDatabase.__hamghadamBlogDatabase.connection;
  if (globalDatabase.__hamghadamBlogDatabase) throw new Error("Cannot change BLOG_DATA_DIR while the database is open");
  mkdirSync(dataDirectory(), { recursive: true, mode: 0o700 });
  const connection = new DatabaseSync(path);
  try {
    chmodSync(path, 0o600);
    connection.exec("PRAGMA busy_timeout=10000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    const version = Number(connection.prepare("PRAGMA user_version").get()?.user_version);
    if (version > 1) throw new Error("Blog database schema is newer than this release");
    if (version === 0) {
      connection.exec("BEGIN IMMEDIATE");
      try {
        connection.exec(`
          CREATE TABLE posts (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL CHECK (kind IN ('article','page')),
            slug TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('draft','published')),
            published_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            version INTEGER NOT NULL CHECK (version > 0),
            data TEXT NOT NULL CHECK (json_valid(data)),
            UNIQUE(kind,slug)
          ) STRICT;
          CREATE INDEX posts_publication ON posts(kind,status,published_at DESC);
          CREATE TABLE redirects (
            kind TEXT NOT NULL,
            slug TEXT NOT NULL,
            post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
            PRIMARY KEY(kind,slug)
          ) STRICT;
          CREATE TABLE settings (
            id INTEGER PRIMARY KEY CHECK (id=1),
            version INTEGER NOT NULL CHECK (version > 0),
            data TEXT NOT NULL CHECK (json_valid(data))
          ) STRICT;
          CREATE TABLE sessions (
            hash TEXT PRIMARY KEY,
            fingerprint TEXT NOT NULL,
            expires_at INTEGER NOT NULL
          ) STRICT;
          CREATE TABLE login_limits (
            key TEXT PRIMARY KEY,
            attempts INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
          ) STRICT;
          PRAGMA user_version=1;
        `);
        connection.prepare("INSERT INTO settings(id,version,data) VALUES(1,1,?)").run(JSON.stringify(initialSettings()));
        connection.exec("COMMIT");
      } catch (error) {
        connection.exec("ROLLBACK");
        throw error;
      }
    }
    globalDatabase.__hamghadamBlogDatabase = { path, connection };
    return connection;
  } catch (error) {
    connection.close();
    throw error;
  }
}

export function closeDatabase() {
  globalDatabase.__hamghadamBlogDatabase?.connection.close();
  delete globalDatabase.__hamghadamBlogDatabase;
}

function postRow(row: Record<string, unknown> | undefined): Post | null {
  return row ? JSON.parse(String(row.data)) as Post : null;
}

export function isPublished(post: Post | null): post is Post {
  return Boolean(post && post.status === "published" && post.publishedAt && Date.parse(post.publishedAt) <= Date.now());
}

export function getPost(id: string) {
  return postRow(getDatabase().prepare("SELECT data FROM posts WHERE id=?").get(id));
}

export function getPostBySlug(kind: Post["kind"], slug: string) {
  return postRow(getDatabase().prepare("SELECT data FROM posts WHERE kind=? AND slug=?").get(kind, slug));
}

export function getRedirect(kind: Post["kind"], slug: string) {
  const post = postRow(getDatabase().prepare("SELECT p.data FROM redirects r JOIN posts p ON p.id=r.post_id WHERE r.kind=? AND r.slug=?").get(kind, slug));
  return isPublished(post) ? post : null;
}

export type ListOptions = {
  kind?: Post["kind"];
  publishedOnly?: boolean;
  query?: string;
  category?: string;
  page?: number;
  pageSize?: number;
};

export function listPosts(options: ListOptions = {}) {
  const conditions: string[] = [];
  const values: (string | number)[] = [];
  if (options.kind) { conditions.push("kind=?"); values.push(options.kind); }
  if (options.publishedOnly) {
    conditions.push("status='published' AND published_at<>'' AND published_at<=?");
    values.push(new Date().toISOString());
  }
  if (options.query?.trim()) {
    conditions.push("(instr(lower(json_extract(data,'$.title')),lower(?))>0 OR instr(lower(json_extract(data,'$.excerpt')),lower(?))>0 OR instr(lower(json_extract(data,'$.body')),lower(?))>0)");
    const query = options.query.trim().slice(0, 200);
    values.push(query, query, query);
  }
  if (options.category?.trim()) { conditions.push("json_extract(data,'$.category')=?"); values.push(options.category.trim().slice(0, 80)); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const page = Number.isSafeInteger(options.page) && Number(options.page) > 0 ? Number(options.page) : 1;
  const pageSize = Number.isSafeInteger(options.pageSize) ? Math.min(100, Math.max(1, Number(options.pageSize))) : 12;
  const total = Number(getDatabase().prepare(`SELECT count(*) AS total FROM posts ${where}`).get(...values)?.total ?? 0);
  const posts = getDatabase().prepare(`SELECT data FROM posts ${where} ORDER BY json_extract(data,'$.featured') DESC,published_at DESC,created_at DESC,id ASC LIMIT ? OFFSET ?`)
    .all(...values, pageSize, Math.min(Number.MAX_SAFE_INTEGER, (page - 1) * pageSize)).map(row => postRow(row)!);
  return { posts, total };
}

export function allPublishedPosts() {
  return getDatabase().prepare("SELECT data FROM posts WHERE status='published' AND published_at<>'' AND published_at<=? ORDER BY published_at DESC,id ASC")
    .all(new Date().toISOString()).map(row => postRow(row)!);
}

function transaction<T>(action: (db: DatabaseSync) => T) {
  const db = getDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = action(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function savePost(value: unknown, id?: string): Post {
  const parsed = postInput(value);
  const suppliedVersion = id ? versionInput(objectInput(value).version) : 0;
  return transaction(db => {
    const previous = id ? getPost(id) : null;
    if (id && !previous) throw new BlogError(404, "محتوا پیدا نشد.");
    if (previous && previous.version !== suppliedVersion) throw new BlogError(409, "این محتوا تغییر کرده است؛ صفحه را دوباره باز کنید.");
    if (previous && previous.kind !== parsed.kind) throw new BlogError(400, "نوع محتوای ذخیره‌شده قابل تغییر نیست.");
    const collision = db.prepare("SELECT id FROM posts WHERE kind=? AND slug=? AND id<>?").get(parsed.kind, parsed.slug, id || "");
    const reserved = db.prepare("SELECT post_id FROM redirects WHERE kind=? AND slug=?").get(parsed.kind, parsed.slug);
    if (collision || (reserved && reserved.post_id !== id)) throw new BlogError(409, "این نامک استفاده شده یا برای پیوند قدیمی محفوظ است.");
    const now = new Date().toISOString();
    const post: Post = {
      ...parsed,
      id: previous?.id || randomUUID(),
      createdAt: previous?.createdAt || now,
      updatedAt: now,
      version: previous ? previous.version + 1 : 1,
      publishedAt: parsed.publishedAt || previous?.publishedAt || (parsed.status === "published" ? now : ""),
    };
    if (previous) {
      db.prepare("UPDATE posts SET slug=?,status=?,published_at=?,updated_at=?,version=?,data=? WHERE id=?")
        .run(post.slug, post.status, post.publishedAt, post.updatedAt, post.version, JSON.stringify(post), post.id);
      if (previous.slug !== post.slug) {
        // An alias targets the immutable post ID, so repeated renames never form redirect chains.
        db.prepare("DELETE FROM redirects WHERE kind=? AND slug=? AND post_id=?").run(post.kind, post.slug, post.id);
        db.prepare("INSERT INTO redirects(kind,slug,post_id) VALUES(?,?,?) ON CONFLICT(kind,slug) DO UPDATE SET post_id=excluded.post_id")
          .run(previous.kind, previous.slug, post.id);
      }
    } else {
      db.prepare("INSERT INTO posts(id,kind,slug,status,published_at,created_at,updated_at,version,data) VALUES(?,?,?,?,?,?,?,?,?)")
        .run(post.id, post.kind, post.slug, post.status, post.publishedAt, post.createdAt, post.updatedAt, post.version, JSON.stringify(post));
    }
    return post;
  });
}

export function deletePost(id: string, version: unknown) {
  const expectedVersion = versionInput(version);
  transaction(db => {
    const existing = getPost(id);
    if (!existing) throw new BlogError(404, "محتوا پیدا نشد.");
    if (existing.version !== expectedVersion) throw new BlogError(409, "این محتوا تغییر کرده است؛ صفحه را دوباره باز کنید.");
    db.prepare("DELETE FROM posts WHERE id=?").run(id);
  });
}

export function getSettings(): SiteSettings {
  const row = getDatabase().prepare("SELECT data FROM settings WHERE id=1").get();
  if (!row) throw new Error("Blog settings are missing");
  return JSON.parse(String(row.data)) as SiteSettings;
}

export function saveSettings(value: unknown): SiteSettings {
  const parsed = settingsInput(value);
  const suppliedVersion = versionInput(objectInput(value).version);
  return transaction(db => {
    const existing = getSettings();
    if (existing.version !== suppliedVersion) throw new BlogError(409, "تنظیمات تغییر کرده‌اند؛ صفحه را دوباره باز کنید.");
    const settings: SiteSettings = { ...parsed, version: existing.version + 1, updatedAt: new Date().toISOString() };
    db.prepare("UPDATE settings SET version=?,data=? WHERE id=1").run(settings.version, JSON.stringify(settings));
    return settings;
  });
}
