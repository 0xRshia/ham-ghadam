import assert from "node:assert/strict";
import { realpathSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

// This helper only refreshes the five existing, isolated visual-preview events.
const requestedPath = process.env.VISUAL_DATABASE_PATH;
assert.ok(requestedPath && isAbsolute(requestedPath), "Set an absolute VISUAL_DATABASE_PATH");
const previewRoot = join(realpathSync(tmpdir()), "hamghadam-change-qa");
assert.equal(realpathSync(previewRoot), previewRoot, "The preview directory must not redirect outside the temporary folder");
const databasePath = realpathSync(requestedPath);
const withinPreview = relative(previewRoot, databasePath);
assert.ok(withinPreview && !isAbsolute(withinPreview) && withinPreview !== ".." && !withinPreview.startsWith(`..${sep}`),
  "VISUAL_DATABASE_PATH must resolve inside the temporary hamghadam-change-qa directory");
assert.ok(statSync(databasePath).isFile(), "The preview database must already exist");

const covers = [
  ["change-qa-halloween", "halloween", "/images/events/halloween.webp"],
  ["change-qa-art", "art", "/images/events/painting.webp"],
  ["change-qa-music", "music", "/images/events/music.webp"],
  ["change-qa-books", "books", "/images/books.jpg"],
  ["change-qa-games", "games", "/images/games.jpg"],
];
const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
for (const [, , image] of covers) {
  const asset = statSync(join(publicRoot, image.slice(1)));
  assert.ok(asset.isFile() && asset.size > 0, `Missing preview image: ${image}`);
}

const db = new DatabaseSync(databasePath);
try {
  db.exec("PRAGMA busy_timeout=10000; BEGIN IMMEDIATE");
  try {
    const event = db.prepare("SELECT id,category FROM events WHERE id=?");
    for (const [id, category] of covers) {
      assert.deepEqual({ ...event.get(id) }, { id, category }, `Missing or unexpected preview event: ${id}`);
    }
    const update = db.prepare("UPDATE events SET image=? WHERE id=? AND category=?");
    for (const [id, category, image] of covers) {
      assert.equal(update.run(image, id, category).changes, 1, `Preview event was not updated: ${id}`);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
} finally {
  db.close();
}
console.log(`Updated only image URLs for ${covers.length} existing preview events in ${databasePath}`);
