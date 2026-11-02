import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { nodeSourceModules } from "./node-source-module.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hamghadam-optional-price-"));
process.env.DATABASE_PATH = path.join(directory, "events.sqlite");
process.env.SEED_SAMPLE_EVENTS = "false";
process.env.TEMP_LOGIN_ENABLED = "false";
const db = new DatabaseSync(process.env.DATABASE_PATH);
const load = nodeSourceModules(path.join(directory, "modules"));
let adapter;
try {
  db.exec("PRAGMA foreign_keys=ON");
  for (const { tag } of JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8")).entries)
    db.exec(fs.readFileSync(`drizzle/${tag}.sql`, "utf8"));
  adapter = (await load("db/node.ts")).database();
  const { readEventInput } = await load("lib/event-input.ts");
  const { persianInput } = await load("lib/persian-date.ts");
  const { saveFastEvent } = await load("lib/fast-events.ts");
  const now = Math.ceil(Date.now() / 300000) * 300000;
  const day = 86400000;
  const input = {
    title: "رویداد با قیمت اختیاری", description: "آزمون قیمت اختیاری پنل",
    category: "books", host_id: null, organizer_name: "برگزارکنندهٔ آزمون",
    venue: "محل آزمون", city: "تهران", maps_url: "https://example.test/venue",
    date: persianInput(now + day), time: "18:00", endDate: persianInput(now + day), endTime: "20:00",
  };

  for (const price of [undefined, "", null]) assert.equal(readEventInput({ ...input, price }).price, 0, `Empty price ${price} is stored as unspecified`);
  assert.equal(readEventInput({ ...input, price: "450000" }).price, 450000);
  for (const price of ["100", "-1000", "12.5", "abc", "100000001"])
    assert.throws(() => readEventInput({ ...input, price }), error => error.status === 400, `Invalid price ${price} is rejected`);

  let event = await saveFastEvent(input, []);
  assert.equal(event.price, 0, "Creating without a price stores zero (unspecified)");
  event = await saveFastEvent({ ...input, price: "450000", revision: event.revision }, [], event.id);
  assert.equal(event.price, 450000, "An entered price is persisted");
  event = await saveFastEvent({ ...input, revision: event.revision }, [], event.id);
  assert.equal(event.price, 450000, "Omitting the price on edit preserves it");
  event = await saveFastEvent({ ...input, price: "", revision: event.revision }, [], event.id);
  assert.equal(event.price, 0, "An explicit empty price clears it");
  console.log("PASS optional event price: empty, valid, invalid, persisted, preserved and cleared");
} finally {
  adapter?.prepare("").connection.close();
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
