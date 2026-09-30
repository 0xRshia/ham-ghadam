import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mvp-event-d1-migration-"));
const configuration = path.join(directory, "wrangler.json");
const persistence = path.join(directory, "state");
const cli = path.join(root, "node_modules/wrangler/bin/wrangler.js");
const environment = {
  ...process.env,
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_WRITE_LOGS: "false",
  CLOUDFLARE_CF_FETCH_ENABLED: "false",
  WRANGLER_LOG_PATH: path.join(directory, "logs"),
  WRANGLER_REGISTRY_PATH: path.join(directory, "registry"),
  MINIFLARE_REGISTRY_PATH: path.join(directory, "miniflare-registry"),
};
fs.writeFileSync(configuration, JSON.stringify({
  name: "event-migration-test",
  compatibility_date: "2026-05-15",
  d1_databases: [{ binding: "DB", database_name: "event-migration-test", database_id: crypto.randomUUID() }],
}));

async function execute(label, source, value) {
  console.log(`D1: ${label}`);
  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      cli, "d1", "execute", "DB", "--local", "--config", configuration,
      "--persist-to", persistence, source, value, "--json",
    ], { cwd: directory, env: environment, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", timedOut = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    // Terminate the whole local Wrangler/workerd group if startup stalls.
    const watchdog = setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform === "win32") child.kill("SIGKILL");
        else process.kill(-child.pid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") reject(error);
      }
    }, 30000);
    child.on("error", (error) => { clearTimeout(watchdog); reject(error); });
    child.on("close", (code) => {
      clearTimeout(watchdog);
      if (timedOut || code !== 0) {
        reject(new Error(`${label}: ${timedOut ? "timed out after 30 seconds" : `exit ${code}`}\n${stderr}\n${stdout}`));
      } else resolve(stdout);
    });
  });
  return JSON.parse(output);
}

const tables = ["events", "reservations", "tickets", "event_scanners"];
const snapshotSql = tables.map((table) => `SELECT * FROM ${table} ORDER BY ${table === "event_scanners" ? "event_id" : "id"}`).join(";");

try {
  const { entries } = JSON.parse(fs.readFileSync(path.join(root, "drizzle/meta/_journal.json"), "utf8"));
  const migrationIndex = entries.findIndex((entry) => entry.tag === "0003_event_maps_media");
  assert(migrationIndex > 0, "Event Maps/media migration must be registered");
  for (const entry of entries.slice(0, migrationIndex)) {
    await execute(entry.tag, "--file", path.join(root, "drizzle", `${entry.tag}.sql`));
  }
  await execute("populate legacy event, purchase, ticket and scanner records", "--command", `
    INSERT INTO users(id,phone,name,created_at) VALUES('host','09990000001','Migration test',10);
    INSERT INTO events(id,host_id,title,description,category,venue,address,city,lat,lng,starts_at,ends_at,price,capacity,image,published,sample,created_at)
      VALUES('event','host','Existing event','Existing description','books','Existing venue','Existing address','تهران',35.7,51.4,100,200,10000,4,'/images/books.jpg',1,0,20);
    INSERT INTO events(id,host_id,title,description,category,venue,address,city,lat,lng,starts_at,ends_at,price,capacity,image,published,sample,created_at)
      VALUES('empty-image','host','Empty legacy image','','books','Venue','Address','تهران',35.8,51.5,100,200,0,NULL,'',0,1,NULL);
    INSERT INTO reservations(id,user_id,event_id,quantity,total,amount_rial,status,request_key,created_at,expires_at,authority,reference,payment_state,attendee_name,attendee_phone)
      VALUES('purchase','host','event',2,20000,200000,'confirmed','existing-request',30,NULL,'existing-authority','existing-reference','paid','Ticket owner','09990000001');
    INSERT INTO tickets(id,reservation_id,ordinal,token,created_at,checked_in_at)
      VALUES('ticket-one','purchase',1,'existing-ticket-one',40,50),('ticket-two','purchase',2,'existing-ticket-two',40,NULL);
    INSERT INTO event_scanners(event_id,token,created_at) VALUES('event','existing-scanner',60);
  `);
  const before = await execute("snapshot legacy rows", "--command", snapshotSql);
  await execute(entries[migrationIndex].tag, "--file", path.join(root, "drizzle", `${entries[migrationIndex].tag}.sql`));
  const after = await execute("verify original rows and relationships", "--command", snapshotSql);
  tables.forEach((table, tableIndex) => {
    const originalRows = before[tableIndex].results;
    const migratedRows = after[tableIndex].results;
    assert.equal(migratedRows.length, originalRows.length, `${table} row count preserved`);
    originalRows.forEach((row, rowIndex) => {
      for (const [column, value] of Object.entries(row)) {
        const expected = table === "events" && column === "image" && value === "" ? null : value;
        assert.deepEqual(migratedRows[rowIndex][column], expected, `${table}.${column} preserved`);
      }
    });
  });
  assert.equal(after[0].results.find((row) => row.id === "event").maps_url,
    "https://www.google.com/maps/search/?api=1&query=35.7%2C51.4");
  const integrity = await execute("check foreign keys, nullable columns and event indexes", "--command", `
    PRAGMA foreign_keys;
    PRAGMA foreign_key_check;
    PRAGMA table_info(events);
    SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='events' ORDER BY name;
  `);
  assert.equal(integrity[0].results[0].foreign_keys, 1, "D1 foreign keys remain enabled");
  assert.deepEqual(integrity[1].results, [], "No foreign key violations");
  for (const name of ["lat", "lng", "image"]) {
    assert.equal(integrity[2].results.find((column) => column.name === name)?.notnull, 0, `${name} permits null`);
  }
  const indexNames = integrity[3].results.map((index) => index.name);
  assert(indexNames.includes("idx_events_city_start") && indexNames.includes("idx_events_host"), "Event indexes preserved");
  const nullable = await execute("write a coordinate-less event and gallery metadata", "--command", `
    INSERT INTO events(id,host_id,title,description,category,venue,address,city,lat,lng,starts_at,ends_at,price,capacity,image,maps_url)
      VALUES('new-event','host','New event','','books','Venue','','تهران',NULL,NULL,300,400,0,NULL,NULL,'https://maps.app.goo.gl/test');
    INSERT INTO event_media(id,event_id,role,position,storage_key,content_type,byte_size,created_at)
      VALUES('media','new-event','gallery',0,'events/new-event/media.jpg','image/jpeg',100,70);
    SELECT lat,lng,image,maps_url FROM events WHERE id='new-event';
    PRAGMA foreign_key_check;
  `);
  const inserted = nullable.find((result) => result.results.some((row) => "maps_url" in row)).results[0];
  assert.equal(inserted.lat, null);
  assert.equal(inserted.lng, null);
  assert.equal(inserted.image, null);
  assert.deepEqual(nullable.at(-1).results, []);
  const deadlineBefore = await execute("snapshot before deadline migration", "--command", snapshotSql + ";SELECT * FROM event_media ORDER BY id;");
  for (const entry of entries.slice(migrationIndex + 1)) {
    await execute(entry.tag, "--file", path.join(root, "drizzle", `${entry.tag}.sql`));
  }
  const deadlineAfter = await execute("verify deadline backfill and relationships", "--command", snapshotSql + ";SELECT * FROM event_media ORDER BY id;PRAGMA table_info(events);PRAGMA foreign_key_check;");
  deadlineBefore.forEach((table, i) => {
    assert.equal(deadlineAfter[i].results.length, table.results.length);
    table.results.forEach((row, j) => {
      for (const [column, value] of Object.entries(row)) assert.deepEqual(deadlineAfter[i].results[j][column], value);
      if (i === 0) assert.equal(deadlineAfter[i].results[j].registration_ends_at, row.starts_at - 86400000);
    });
  });
  assert.equal(deadlineAfter[5].results.find((column) => column.name === "registration_ends_at").notnull, 1);
  assert.deepEqual(deadlineAfter[6].results, []);
  const community = await execute("verify additive community and content migration", "--command", `
    SELECT name FROM sqlite_master WHERE type='table' AND name IN ('articles','article_media','site_content','contact_messages','host_customer_metadata','event_reviews','review_replies') ORDER BY name;
    SELECT key FROM site_content ORDER BY key;
    SELECT status,published_at FROM articles;
    PRAGMA foreign_key_check;
  `);
  assert.equal(community[0].results.length, 7, "All community tables exist");
  assert.deepEqual(community[1].results.map((row) => row.key), ["about", "contact", "faq"]);
  assert.equal(community[2].results.length, 3, "Three original guides are seeded");
  assert(community[2].results.every((row) => row.status === "draft" && row.published_at === null), "Guides stay unpublished until admin review");
  assert.deepEqual(community[3].results, []);
  console.log("PASS local D1 Maps/media and registration deadline migrations preserve data, tokens, indexes and foreign keys; deadlines backfill exactly 24 hours before start.");
  console.log("PASS community/content tables and unpublished guide seeds preserve existing records and relationships.");
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
