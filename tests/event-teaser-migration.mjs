import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { organizerMigrationSeed } from "./organizer-migration-fixture.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hamghadam-teaser-migration-"));
const { entries } = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
const mainSql = fs.readFileSync(new URL("./fixtures/migrations/0024_event_teaser_main.sql", import.meta.url), "utf8");
const checksum = sql => createHash("sha256").update(sql).digest("hex");
const plain = value => JSON.parse(JSON.stringify(value));

function existingDatabase(name, branch) {
  const filename = path.join(directory, `${name}.sqlite`);
  const db = new DatabaseSync(filename);
  try {
    db.exec("PRAGMA foreign_keys=ON; CREATE TABLE mvp_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)");
    for (const { tag } of entries) {
      if (branch === "main" && tag === "0025_organizer_media") break;
      if (branch === "stage" && tag === "0030_squirrel_wallet_rewards") break;
      const sql = branch === "main" && tag === "0024_event_teaser" ? mainSql : fs.readFileSync(`drizzle/${tag}.sql`, "utf8");
      db.exec(sql);
      db.prepare("INSERT INTO mvp_migrations VALUES (?,?,?)").run(tag, checksum(sql), 1);
      if (tag === "0019_ticket_discount") db.exec(organizerMigrationSeed);
    }
    const column = branch === "main" ? "teaser" : "teaser_url";
    db.prepare(`UPDATE events SET ${column}=? WHERE id='organizer-event'`).run("https://media.example.test/teaser.mp4?token=preserved");
    if (branch === "stage") {
      db.prepare("INSERT INTO squirrel_reward_sessions(id,browser_hash,seed,issued_at,expires_at) VALUES('prior-reward','prior-browser',73,1,2700001)").run();
      db.prepare("INSERT INTO squirrel_reward_coupons(code,browser_hash,session_id,issued_at) VALUES('old-code','prior-browser','prior-reward',15)").run();
      const user = db.prepare("SELECT id FROM users ORDER BY id LIMIT 1").get().id;
      db.prepare("INSERT INTO wallets(user_id,balance,updated_at) VALUES(?,5000,3)").run(user);
      db.prepare("INSERT INTO wallet_transactions(id,user_id,kind,amount,status,balance_after,note,created_at,completed_at) VALUES('prior-grant',?,'admin_grant',5000,'completed',5000,'هدیه',2,3)").run(user);
      db.prepare("INSERT INTO wallet_transactions(id,user_id,kind,amount,status,authority,payment_state,created_at) VALUES('prior-top-up',?,'top_up',2000,'pending','prior-authority','pending',4)").run(user);
    }
  } finally {
    db.close();
  }
  return filename;
}

function snapshot(filename) {
  const db = new DatabaseSync(filename);
  try {
    return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
      .map(({ name }) => [name, plain(db.prepare(`SELECT * FROM "${name}" ORDER BY 1`).all())]));
  } finally {
    db.close();
  }
}

function migrate(filename, error) {
  const result = spawnSync(process.execPath, ["scripts/migrate-node.mjs"], {
    env: { ...process.env, DATABASE_PATH: filename }, encoding: "utf8", timeout: 30000,
  });
  assert.ifError(result.error);
  if (error) {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, error);
  } else assert.equal(result.status, 0, result.stderr);
}

try {
  for (const branch of ["main", "stage"]) {
    const filename = existingDatabase(branch, branch);
    const before = snapshot(filename);
    if (branch === "main") {
      before.events = before.events.map(({ teaser, ...event }) => ({ ...event, teaser_url: teaser }));
      before.reservations = before.reservations.map(reservation => ({ ...reservation, squirrel_coupon_code: null, squirrel_coupon_discount: 0 }));
    }
    if (branch === "stage") {
      before.squirrel_reward_sessions = before.squirrel_reward_sessions.map(session => ({
        ...session, reward_mode: "coupon", user_id: null, handoff_hash: null, handoff_expires_at: null,
      }));
      before.wallet_transactions = before.wallet_transactions.map(transaction => ({ ...transaction, game_session_id: null }));
    }
    migrate(filename);
    const after = snapshot(filename);
    for (const [table, rows] of Object.entries(before)) {
      if (table === "mvp_migrations") {
        for (const row of rows) assert.deepEqual(after[table].find(item => item.name === row.name), row, "Applied migration checksums and timestamps stay intact");
      } else assert.deepEqual(after[table], rows, `${branch}: ${table} data survives the merge`);
    }
    assert.equal(after.mvp_migrations.length, entries.length);
    assert.deepEqual(after.organizer_media, []);
    migrate(filename);
    assert.deepEqual(snapshot(filename), after, "Repeating the upgrade is a no-op");
    const db = new DatabaseSync(filename);
    try {
      assert.equal(db.prepare("PRAGMA table_info(events)").all().some(column => column.name === "teaser"), false);
      const revision = db.prepare("SELECT revision FROM events WHERE id='organizer-event'").get().revision;
      db.exec("UPDATE events SET teaser_url=NULL WHERE id='organizer-event'");
      assert.deepEqual(plain(db.prepare("SELECT teaser_url,revision FROM events WHERE id='organizer-event'").get()), { teaser_url: null, revision: revision + 1 });
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    } finally {
      db.close();
    }
    console.log(`PASS ${branch} upgrade preserves teaser links, history, migration records and revision tracking; reruns are safe`);
  }

  const fresh = path.join(directory, "fresh.sqlite");
  migrate(fresh);
  const freshState = snapshot(fresh);
  migrate(fresh);
  assert.deepEqual(snapshot(fresh), freshState);
  assert.equal(freshState.mvp_migrations.length, entries.length);

  for (const failure of ["checksum", "both-columns", "missing-column"]) {
    const filename = existingDatabase(failure, "main");
    const db = new DatabaseSync(filename);
    try {
      if (failure === "checksum") db.prepare("UPDATE mvp_migrations SET checksum=? WHERE name='0024_event_teaser'").run("0".repeat(64));
      else if (failure === "both-columns") db.exec("ALTER TABLE events ADD COLUMN teaser_url TEXT");
      else db.exec("ALTER TABLE events RENAME COLUMN teaser TO unexpected_teaser");
    } finally {
      db.close();
    }
    const before = snapshot(filename);
    migrate(filename, failure === "checksum" ? /Applied migration changed: 0024_event_teaser/ : /Unexpected teaser columns/);
    assert.deepEqual(snapshot(filename), before, "Unknown history and ambiguous schemas fail without changing data");
  }
  console.log("PASS fresh migrations and strict rejection of unknown checksums or incompatible teaser schemas");
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
