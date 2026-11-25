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
  const nextMigration = {
    main: "0025_organizer_media",
    stage: "0030_squirrel_wallet_rewards",
    "stage-wallet": "0031_squirrel_reward_amount",
  }[branch];
  try {
    db.exec("PRAGMA foreign_keys=ON; CREATE TABLE mvp_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)");
    for (const { tag } of entries) {
      if (tag === nextMigration) break;
      const sql = branch === "main" && tag === "0024_event_teaser" ? mainSql : fs.readFileSync(`drizzle/${tag}.sql`, "utf8");
      db.exec(sql);
      db.prepare("INSERT INTO mvp_migrations VALUES (?,?,?)").run(tag, checksum(sql), 1);
      if (tag === "0019_ticket_discount") db.exec(organizerMigrationSeed);
    }
    const column = branch === "main" ? "teaser" : "teaser_url";
    db.prepare(`UPDATE events SET ${column}=? WHERE id='organizer-event'`).run("https://media.example.test/teaser.mp4?token=preserved");
    if (branch !== "main") {
      db.prepare("INSERT INTO squirrel_reward_sessions(id,browser_hash,seed,issued_at,expires_at) VALUES('prior-reward','prior-browser',73,1,2700001)").run();
      db.prepare("INSERT INTO squirrel_reward_coupons(code,browser_hash,session_id,issued_at) VALUES('old-code','prior-browser','prior-reward',15)").run();
      db.prepare("UPDATE reservations SET squirrel_coupon_code='old-code',squirrel_coupon_discount=100 WHERE id='organizer-booking'").run();
      const user = db.prepare("SELECT id FROM users ORDER BY id LIMIT 1").get().id;
      db.prepare("INSERT INTO wallets(user_id,balance,updated_at) VALUES(?,5000,3)").run(user);
      db.prepare("INSERT INTO wallet_transactions(id,user_id,kind,amount,status,balance_after,note,created_at,completed_at) VALUES('prior-grant',?,'admin_grant',5000,'completed',5000,'هدیه',2,3)").run(user);
      db.prepare("INSERT INTO wallet_transactions(id,user_id,kind,amount,status,authority,payment_state,created_at) VALUES('prior-top-up',?,'top_up',2000,'pending','prior-authority','pending',4)").run(user);
    }
    if (branch === "stage-wallet") {
      db.exec(`
        INSERT INTO users(id,phone,name,created_at) VALUES('near-cap-winner','09990000002','بازیکن',1);
        INSERT INTO squirrel_reward_sessions(id,browser_hash,seed,issued_at,expires_at,user_id,reward_mode) VALUES
          ('wallet-win','winning-browser',9,4,2700004,'host','wallet'),
          ('near-cap-win','other-browser',63,4,2700004,'near-cap-winner','wallet');
        INSERT INTO wallet_transactions(id,user_id,kind,amount,status,balance_after,created_at,completed_at,game_session_id) VALUES
          ('prior-wallet-award','host','game_reward',100,'completed',5100,5,6,'wallet-win'),
          ('near-cap-grant','near-cap-winner','admin_grant',9900001,'completed',9900001,2,3,NULL),
          ('near-cap-wallet-award','near-cap-winner','game_reward',100,'completed',9900101,5,6,'near-cap-win'),
          ('following-grant','host','admin_grant',2000,'completed',7100,7,8,NULL);
        INSERT INTO wallets(user_id,balance,updated_at) VALUES('near-cap-winner',9900101,6);
        UPDATE wallets SET balance=7100,updated_at=8 WHERE user_id='host';
      `);
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
  for (const branch of ["main", "stage", "stage-wallet"]) {
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
    if (branch === "stage-wallet") {
      const adjustments = after.wallet_transactions.filter(transaction => transaction.kind === "game_reward_adjustment");
      assert.equal(adjustments.length, 1, "Only the wallet with room receives the 99,900 correction");
      const [adjustment] = adjustments;
      assert.ok(Number.isSafeInteger(adjustment.created_at) && adjustment.created_at > 8);
      const receivedAt = adjustment.created_at;
      assert.deepEqual(adjustment, {
        id: "fandogh-adjustment:prior-wallet-award", user_id: "host", kind: "game_reward_adjustment",
        amount: 99_900, status: "completed", balance_after: 107_000, note: "", authority: null,
        reference: null, payment_state: null, created_at: receivedAt, completed_at: receivedAt, game_session_id: null,
      });
      before.wallet_transactions = [...before.wallet_transactions, adjustment]
        .sort((left, right) => left.id.localeCompare(right.id, "en"));
      before.wallets = before.wallets.map(wallet => wallet.user_id === "host"
        ? { ...wallet, balance: 107_000, updated_at: receivedAt }
        : wallet);
    }
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
      if (branch === "stage-wallet") {
        db.exec(`
          PRAGMA foreign_keys=ON;
          SAVEPOINT new_reward_amount;
          INSERT INTO users(id,phone,name,created_at) VALUES('new-winner','09990000003','بازیکن تازه',1);
          INSERT INTO squirrel_reward_sessions(id,browser_hash,seed,issued_at,expires_at,user_id,reward_mode)
            VALUES('new-win','new-browser',22,4,2700004,'new-winner','wallet');
        `);
        const newAward = db.prepare(`INSERT INTO wallet_transactions
          (id,user_id,kind,amount,status,balance_after,created_at,completed_at,game_session_id)
          VALUES('new-award','new-winner','game_reward',?,'completed',?,9,9,'new-win')`);
        assert.throws(() => newAward.run(100, 100), /new game rewards must be 100000 toman/);
        assert.equal(newAward.run(100_000, 100_000).changes, 1);
        db.exec("ROLLBACK TO new_reward_amount; RELEASE new_reward_amount;");
        console.log("PASS 100-toman prize history is preserved, eligible wallets receive one cap-safe correction, and new awards require 100,000 toman");
      }
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
