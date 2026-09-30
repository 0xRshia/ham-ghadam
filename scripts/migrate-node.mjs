import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";

const filename = process.env.DATABASE_PATH;
if (!filename || !isAbsolute(filename)) throw new Error("DATABASE_PATH must be an absolute SQLite file path");
const db = new DatabaseSync(filename);
try {
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
  db.exec("CREATE TABLE IF NOT EXISTS mvp_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)");
  const { entries } = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const { tag } of entries) {
    const sql = readFileSync(new URL(`../drizzle/${tag}.sql`, import.meta.url), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    db.exec("BEGIN IMMEDIATE");
    try {
      const applied = db.prepare("SELECT checksum FROM mvp_migrations WHERE name=?").get(tag);
      if (applied && applied.checksum !== checksum) throw new Error(`Applied migration changed: ${tag}`);
      if (!applied) {
        db.exec(sql);
        db.prepare("INSERT INTO mvp_migrations VALUES (?,?,?)").run(tag, checksum, Date.now());
        console.log(`Applied ${tag}`);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
} finally {
  db.close();
}
