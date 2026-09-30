import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "mvp-media-backup-"));
const source = path.join(temporary, "source.sqlite");
const media = path.join(temporary, "uploads");
const backups = path.join(temporary, "backups");
const key = "10000000-0000-4000-8000-000000000000.jpg";
const articleKey = "20000000-0000-4000-8000-000000000000.jpg";
const profileKey = "30000000-0000-4000-8000-000000000000.jpg";
const bytes = fs.readFileSync("public/images/cafe.jpg");
fs.mkdirSync(media);
fs.mkdirSync(backups);
fs.writeFileSync(path.join(media, key), bytes);
function run(database = source, directory = backups, mediaPath = media) {
  return spawnSync(process.execPath, ["scripts/backup-node.mjs"], {
    env: { ...process.env, DATABASE_PATH: database, BACKUP_DIRECTORY: directory, MEDIA_PATH: mediaPath },
    encoding: "utf8",
  });
}
try {
  const db = new DatabaseSync(source);
  db.exec("CREATE TABLE event_media (storage_key TEXT PRIMARY KEY, byte_size INTEGER NOT NULL)");
  db.exec("CREATE TABLE article_media (storage_key TEXT PRIMARY KEY, byte_size INTEGER NOT NULL)");
  db.exec("CREATE TABLE profile_media (storage_key TEXT PRIMARY KEY, byte_size INTEGER NOT NULL)");
  db.prepare("INSERT INTO profile_media VALUES (?,?)").run(profileKey, bytes.length);
  fs.writeFileSync(path.join(media, profileKey), bytes);
  db.prepare("INSERT INTO event_media VALUES (?,?)").run(key, bytes.length);
  db.prepare("INSERT INTO article_media VALUES (?,?)").run(articleKey, bytes.length);
  fs.writeFileSync(path.join(media, articleKey), bytes);
  db.close();

  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const snapshot = fs.readdirSync(backups).find((name) => name.endsWith(".sqlite"));
  const pairedMedia = path.join(backups, snapshot.replace(/\.sqlite$/, ".media"));
  assert.deepEqual(fs.readFileSync(path.join(pairedMedia, key)), bytes);
  assert.deepEqual(fs.readFileSync(path.join(pairedMedia, articleKey)), bytes);
  assert.deepEqual(fs.readFileSync(path.join(pairedMedia, profileKey)), bytes);
  const restored = path.join(temporary, "restored.sqlite");
  const restoredMedia = path.join(temporary, "restored-uploads");
  fs.copyFileSync(path.join(backups, snapshot), restored);
  fs.cpSync(pairedMedia, restoredMedia, { recursive: true });
  const restoredDatabase = new DatabaseSync(restored, { readOnly: true });
  const reference = restoredDatabase.prepare("SELECT storage_key,byte_size FROM event_media").get();
  const articleReference = restoredDatabase.prepare("SELECT storage_key,byte_size FROM article_media").get();
  const profileReference = restoredDatabase.prepare("SELECT storage_key,byte_size FROM profile_media").get();
  restoredDatabase.close();
  assert.equal(profileReference.byte_size, bytes.length);
  assert.deepEqual(fs.readFileSync(path.join(restoredMedia, profileReference.storage_key)), bytes);
  assert.equal(reference.byte_size, bytes.length);
  assert.deepEqual(fs.readFileSync(path.join(restoredMedia, reference.storage_key)), bytes);
  assert.equal(articleReference.byte_size, bytes.length);
  assert.deepEqual(fs.readFileSync(path.join(restoredMedia, articleReference.storage_key)), bytes);
  console.log("PASS paired SQLite/media backup restores event images, article covers and profile avatars");

  fs.unlinkSync(path.join(media, key));
  const previous = fs.readdirSync(backups).sort();
  const missing = run();
  assert.notEqual(missing.status, 0);
  assert.deepEqual(fs.readdirSync(backups).sort(), previous, "Missing media cannot publish an incomplete snapshot");
  fs.writeFileSync(path.join(media, key), bytes);

  const legacy = path.join(temporary, "legacy.sqlite");
  const legacyBackups = path.join(temporary, "legacy-backups");
  fs.mkdirSync(legacyBackups);
  const old = new DatabaseSync(legacy);
  old.exec("CREATE TABLE legacy (id TEXT PRIMARY KEY); INSERT INTO legacy VALUES ('retained')");
  old.close();
  const legacyResult = run(legacy, legacyBackups, "");
  assert.equal(legacyResult.status, 0, legacyResult.stderr);
  const legacySnapshot = fs.readdirSync(legacyBackups).find((name) => name.endsWith(".sqlite"));
  assert.deepEqual(fs.readdirSync(path.join(legacyBackups, legacySnapshot.replace(/\.sqlite$/, ".media"))), []);
  console.log("PASS missing-file failure leaves prior backups intact; legacy databases need no media configuration");

  for (let index = 1; index <= 15; index++) {
    const name = `mvp-2020-01-${String(index).padStart(2, "0")}T00-00-00.000Z.sqlite`;
    fs.copyFileSync(source, path.join(backups, name));
    const folder = path.join(backups, name.replace(/\.sqlite$/, ".media"));
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, key), bytes);
  }
  const retained = run();
  assert.equal(retained.status, 0, retained.stderr);
  const files = fs.readdirSync(backups);
  const snapshots = files.filter((name) => name.endsWith(".sqlite"));
  const pairs = files.filter((name) => name.endsWith(".media"));
  assert.equal(snapshots.length, 14);
  assert.equal(pairs.length, 14);
  for (const name of snapshots) assert(pairs.includes(name.replace(/\.sqlite$/, ".media")));
  assert(!files.some((name) => name.startsWith("mvp-2020-01-01")));
  assert(!files.some((name) => name.startsWith(".pending-")));
  console.log("PASS retention removes old database/media pairs and leaves fourteen complete snapshots");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
