import { createHash, randomUUID } from "node:crypto";
import { backup, DatabaseSync } from "node:sqlite";
import { chmod, copyFile, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { databasePath, dataDirectory } from "../lib/config.ts";

const configured = process.env.BLOG_BACKUP_DIR;
if (!configured || !isAbsolute(configured)) throw new Error("BLOG_BACKUP_DIR must be an absolute path outside BLOG_DATA_DIR");
const data = await realpath(dataDirectory());
await mkdir(configured, { recursive: true, mode: 0o700 });
const destination = await realpath(configured);
const relation = relative(data, destination);
if (!relation || (!relation.startsWith("../") && relation !== ".." && !isAbsolute(relation))) {
  throw new Error("Backup directory must be outside the application data directory");
}
if (!(await stat(databasePath())).isFile()) throw new Error("Blog database is missing");

const timestamp = new Date().toISOString();
const name = `blog-${timestamp.replace(/[:.]/g, "-")}-${randomUUID()}`;
const partial = join(destination, `.${name}.partial`);
const complete = join(destination, name);
await mkdir(partial, { mode: 0o700 });
const source = new DatabaseSync(databasePath(), { readOnly: true });
let snapshot: DatabaseSync | undefined;

try {
  await backup(source, join(partial, "blog.sqlite"));
  await chmod(join(partial, "blog.sqlite"), 0o600);
  snapshot = new DatabaseSync(join(partial, "blog.sqlite"), { readOnly: true });
  const integrity = snapshot.prepare("PRAGMA integrity_check").all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") throw new Error("SQLite backup integrity check failed");
  if (snapshot.prepare("PRAGMA foreign_key_check").all().length) throw new Error("SQLite backup foreign key check failed");
  const schemaVersion = Number(snapshot.prepare("PRAGMA user_version").get()?.user_version);
  if (schemaVersion !== 1) throw new Error("Unsupported blog database schema for this backup tool");
  const posts = snapshot.prepare("SELECT data FROM posts").all();
  const settings = snapshot.prepare("SELECT data FROM settings").all();
  if (settings.length !== 1) throw new Error("Blog settings are missing from snapshot");
  const referencedMedia = new Set<string>();
  for (const row of [...posts, ...settings]) {
    for (const match of String(row.data).matchAll(/\/media\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp)/g)) {
      referencedMedia.add(match[1]);
    }
  }
  const sourceMedia = join(data, "media");
  await mkdir(join(partial, "media"), { mode: 0o700 });
  let files: string[] = [];
  try { files = await readdir(sourceMedia); }
  catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  const copied = new Set<string>();
  const checksums: Record<string, string> = {};
  for (const file of files) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/.test(file)) throw new Error("Unexpected file in blog media directory");
    const sourceFile = join(sourceMedia, file);
    const metadata = await lstat(sourceFile);
    if (!metadata.isFile() || metadata.size === 0) throw new Error("Invalid blog media file");
    const target = join(partial, "media", file);
    await copyFile(sourceFile, target);
    await chmod(target, 0o600);
    const bytes = await readFile(target);
    if (bytes.length !== metadata.size) throw new Error("Media file changed during backup; stop writers and retry");
    checksums[`media/${file}`] = createHash("sha256").update(bytes).digest("hex");
    copied.add(file);
  }
  for (const reference of referencedMedia) {
    if (!copied.has(reference)) throw new Error(`Referenced media is missing: ${reference}`);
  }
  snapshot.close();
  snapshot = undefined;
  checksums["blog.sqlite"] = createHash("sha256").update(await readFile(join(partial, "blog.sqlite"))).digest("hex");
  const manifest = { format: 1, createdAt: timestamp, schemaVersion, posts: posts.length, settings: settings.length, media: copied.size, checksums };
  await writeFile(join(partial, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx", flush: true });
  await rename(partial, complete);
  console.log(JSON.stringify({ backup: complete, posts: posts.length, media: copied.size, integrity: "ok" }));
} catch (error) {
  await rm(partial, { recursive: true, force: true });
  throw error;
} finally {
  snapshot?.close();
  source.close();
}
