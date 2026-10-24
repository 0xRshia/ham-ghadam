import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { nodeSourceModules } from "./node-source-module.mjs";
import { organizerMigrationSeed } from "./organizer-migration-fixture.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fast-editor-rsc-"));
process.env.DATABASE_PATH = path.join(directory, "events.sqlite");
process.env.HOST_PHONES = "09990000001";
process.env.TEMP_LOGIN_ENABLED = "false";
process.env.NODE_ENV = "production";
const connection = new DatabaseSync(process.env.DATABASE_PATH);
connection.exec("PRAGMA foreign_keys=ON");
const load = nodeSourceModules(path.join(directory, "modules"));
let adapter;
try {
  const { entries } = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
  for (const { tag } of entries) connection.exec(fs.readFileSync(`drizzle/${tag}.sql`, "utf8"));
  connection.exec(organizerMigrationSeed);
  connection.exec(`
    INSERT INTO event_media(id,event_id,role,position,storage_key,content_type,byte_size,created_at)
      VALUES('editor-gallery','organizer-event','gallery',0,'00000000-0000-4000-8000-000000000002.jpg','image/jpeg',100,1);
    INSERT INTO event_ticket_tiers(id,event_id,name,description,price,capacity,position)
      VALUES('editor-second-tier','organizer-event','ویژه','بلیت دوم',2000,5,1);
  `);
  adapter = (await load("db/node.ts")).database();
  const { fastEvent, fastOrganizers } = await load("lib/fast-events.ts");
  const { renderToReadableStream } = await import("react-server-dom-webpack/server.node");
  async function assertSerializable(label) {
    // These are the actual props passed by the edit page to its client editor.
    const props = { initial: await fastEvent("organizer-event"), organizers: await fastOrganizers() };
    assert.equal(props.initial.ticketTiers.length, 2);
    assert.equal(props.initial.gallery.length, 1);
    const errors = [];
    const stream = await renderToReadableStream(props, {}, { onError(error) { errors.push(error); return "editor-serialization-test"; } });
    const flight = await new Response(stream).text();
    assert.equal(errors.length, 0, errors[0]?.message);
    assert.doesNotMatch(flight, /\d+:E\{/);
    console.log(`PASS ${label}: real editor props with ticket tiers, gallery and organizer directory serialize through React Flight`);
  }
  await assertSerializable("Linked organizer");
  connection.prepare("UPDATE events SET host_id=NULL,organizer_name=? WHERE id=?").run("برگزارکنندهٔ مستقل", "organizer-event");
  await assertSerializable("Name-only organizer");
  console.log("No application server was started.");
} finally {
  adapter?.prepare("").connection.close();
  connection.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
