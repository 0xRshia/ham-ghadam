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
      if (applied && applied.checksum !== checksum) {
        // main (6d1f594) and stage (2788613) published different SQL under this
        // tag. Accept only that exact pair; preserve the original journal row.
        const mainTeaserMigration = tag === "0024_event_teaser"
          && applied.checksum === "1a6bc1ba91c75e7f80a61bf862dd06554e9f308be40c977f33b6e6e2bcfc633e"
          && checksum === "6a1eb1bd0c0a6646eeec424c46593d277ad19b201248d23b31ed39ae86faf8fa";
        if (!mainTeaserMigration) throw new Error(`Applied migration changed: ${tag}`);
        const columns = db.prepare("PRAGMA table_info(events)").all().map(column => column.name);
        if (columns.includes("teaser") && !columns.includes("teaser_url")) {
          db.exec("ALTER TABLE events RENAME COLUMN teaser TO teaser_url");
          console.log("Reconciled main teaser column with stage; original migration checksum retained");
        } else if (columns.includes("teaser") || !columns.includes("teaser_url")) {
          throw new Error("Unexpected teaser columns for the main migration");
        }
      }
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
