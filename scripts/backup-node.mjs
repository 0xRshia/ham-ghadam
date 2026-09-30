import { DatabaseSync, backup } from "node:sqlite";
import { copyFileSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, unlinkSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";

const filename = process.env.DATABASE_PATH;
const directory = process.env.BACKUP_DIRECTORY;
if (!filename || !isAbsolute(filename) || !directory || !isAbsolute(directory)) {
  throw new Error("DATABASE_PATH and BACKUP_DIRECTORY must be absolute paths");
}
const destination = join(directory, `mvp-${new Date().toISOString().replaceAll(":", "-")}.sqlite`);
const mediaDestination = destination.replace(/\.sqlite$/, ".media");
const pending = join(directory, `.pending-${randomUUID()}.sqlite`);
const pendingMedia = pending.replace(/\.sqlite$/, ".media");
let mediaPublished = false;
try {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    await backup(db, pending);
  } finally {
    db.close();
  }
  const saved = new DatabaseSync(pending, { readOnly: true });
  try {
    const result = saved.prepare("PRAGMA integrity_check").get();
    if (result.integrity_check !== "ok") throw new Error("Backup integrity check failed");
    const tables = saved.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('event_media','article_media','profile_media')").all();
    const images = [];
    if (tables.some(({ name }) => name === "event_media")) {
      images.push(...saved.prepare("SELECT storage_key,byte_size FROM event_media").all());
    }
    if (tables.some(({ name }) => name === "article_media")) {
      images.push(...saved.prepare("SELECT storage_key,byte_size FROM article_media").all());
    }
    if (tables.some(({ name }) => name === "profile_media")) {
      images.push(...saved.prepare("SELECT storage_key,byte_size FROM profile_media").all());
    }
    const mediaPath = process.env.MEDIA_PATH;
    if (images.length && (!mediaPath || !isAbsolute(mediaPath))) {
      throw new Error("MEDIA_PATH must be absolute to back up uploaded images");
    }
    mkdirSync(pendingMedia, { mode: 0o700 });
    // Files are immutable: copying references from the completed DB snapshot
    // includes exactly the files needed to restore that snapshot.
    for (const image of images) {
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(?:jpg|png|webp)$/.test(image.storage_key)) {
        throw new Error("Invalid media key in database snapshot");
      }
      const target = join(pendingMedia, image.storage_key);
      copyFileSync(join(mediaPath, image.storage_key), target);
      if (statSync(target).size !== image.byte_size) throw new Error("Backup image size check failed");
    }
  } finally {
    saved.close();
  }
  renameSync(pendingMedia, mediaDestination);
  mediaPublished = true;
  renameSync(pending, destination);
} catch (error) {
  rmSync(pending, { force: true });
  rmSync(pendingMedia, { force: true, recursive: true });
  if (mediaPublished) rmSync(mediaDestination, { force: true, recursive: true });
  throw error;
}
console.log(`Verified database and media backup: ${destination}`);
// Retain each of the newest 14 verified snapshots with its corresponding files.
const snapshots = readdirSync(directory).filter((name) => /^mvp-\d{4}-.*\.sqlite$/.test(name)).sort().reverse();
for (const old of snapshots.slice(14)) {
  unlinkSync(join(directory, old));
  rmSync(join(directory, old.replace(/\.sqlite$/, ".media")), { force: true, recursive: true });
}
