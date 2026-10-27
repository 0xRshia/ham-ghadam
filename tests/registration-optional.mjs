import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { nodeSourceModules } from "./node-source-module.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hamghadam-optional-deadline-"));
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
  const { saveFastEvent, fastEvent } = await load("lib/fast-events.ts");
  const { eventAvailable, scheduleDateLabel, scheduleTimeLabel } = await load("lib/event-schedule.ts");
  const { filterEvents, groupEvents, defaultCatalogFilters } = await load("lib/event-catalog.ts");
  const { GET: catalog } = await load("app/api/events/route.ts");
  const { reserveSql, confirmSql } = await load("lib/booking-sql.ts");
  const { reserveTiersSql, insertReservationItemsSql } = await load("lib/ticket-tiers.ts");
  const now = Math.ceil(Date.now() / 300000) * 300000;
  const day = 86400000;
  const input = {
    title: "رویداد سه‌روزه", description: "آزمون مهلت اختیاری و زمان پایان",
    category: "books", host_id: null, organizer_name: "برگزارکنندهٔ آزمون",
    venue: "محل آزمون", city: "تهران", maps_url: "https://example.test/venue",
    date: persianInput(now + day), time: "18:00",
    endDate: persianInput(now + 4 * day), endTime: "20:00", capacity: "2", published: true,
  };
  for (const values of [{}, { registrationDate: null, registrationTime: null }, { registrationDate: "", registrationTime: "" }])
    assert.equal(readEventInput({ ...input, ...values }).registrationEnd, null);
  for (const values of [
    { registrationDate: input.date }, { registrationTime: "18:00" },
    { registrationDate: input.date, registrationTime: "" },
    { registrationDate: "invalid", registrationTime: "18:00" },
    { registrationDate: input.endDate, registrationTime: "20:05" },
    { registrationDate: input.endDate, registrationTime: "19:01" },
  ]) assert.throws(() => readEventInput({ ...input, ...values }), error => error.status === 400);
  const explicit = { registrationDate: persianInput(now + 2 * day), registrationTime: "18:00" };
  assert.ok(readEventInput({ ...input, ...explicit }).registrationEnd > readEventInput(input).start);
  assert.equal(readEventInput({ ...input, registrationDate: input.endDate, registrationTime: input.endTime }).registrationEnd, readEventInput(input).end);

  let event = await saveFastEvent(input, []);
  assert.equal(event.registration_ends_at, null);
  event = await saveFastEvent({ ...input, ...explicit, revision: event.revision }, [], event.id);
  const deadline = event.registration_ends_at;
  event = await saveFastEvent({ ...input, revision: event.revision }, [], event.id);
  assert.equal(event.registration_ends_at, deadline, "Omitting fields on edit preserves the deadline");
  event = await saveFastEvent({ ...input, registrationDate: "", registrationTime: "", revision: event.revision }, [], event.id);
  assert.equal(event.registration_ends_at, null, "Clearing the deadline persists null");
  console.log("PASS optional input, incomplete/invalid deadlines, deadlines after start, and persisted add/preserve/remove edits");

  db.prepare("UPDATE events SET starts_at=?,ends_at=? WHERE id=?").run(now - day, now + 2 * day, event.id);
  event = await fastEvent(event.id);
  assert.ok(eventAvailable(event, now));
  assert.ok(eventAvailable(event, event.ends_at - 1));
  assert.equal(eventAvailable(event, event.ends_at), false);
  assert.match(scheduleDateLabel(event), / تا /);
  assert.match(scheduleTimeLabel(event), / تا /);
  const result = await catalog(new Request("http://localhost/api/events"));
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.ok(data.events.some(item => item.id === event.id && item.registration_ends_at === null));
  assert.ok(data.suggestions.some(item => item.eventId === event.id));
  const filtered = filterEvents(data.events, { ...defaultCatalogFilters, when: "today" }, now);
  assert.ok(filtered.some(item => item.id === event.id), "An ongoing event remains in today's catalog");
  assert.ok(groupEvents(filtered, data.suggestions, now).suggested.some(item => item.event.id === event.id));
  assert.equal(filterEvents([event], defaultCatalogFilters, event.ends_at).length, 0);
  assert.equal(groupEvents([event], data.suggestions, event.ends_at).suggested.length, 0);
  db.prepare("UPDATE events SET ends_at=? WHERE id=?").run(Date.now() - 1, event.id);
  assert.equal((await (await catalog(new Request("http://localhost/api/events"))).json()).events.some(item => item.id === event.id), false);
  db.prepare("UPDATE events SET ends_at=? WHERE id=?").run(event.ends_at, event.id);
  console.log("PASS real catalog API, browser filters, suggestions and multi-day date/time labels use event end");

  db.prepare("INSERT INTO users(id,phone,name,created_at) VALUES('buyer','09990000002','آزمون',?)").run(now);
  function sql(query, values) {
    const keys = [...new Set(query.match(/\?\d+/g))];
    return db.prepare(query).get(Object.fromEntries(keys.map(key => [key, values[Number(key.slice(1)) - 1]])));
  }
  function reserve(at, id = event.id, items, total = 0) {
    const key = randomUUID();
    const args = [key, "buyer", id, 1, key, at, at + 900000, "آزمون", 0];
    if (!items) return sql(reserveSql, args);
    db.exec("BEGIN");
    try {
      const encoded = JSON.stringify(items);
      const booking = sql(reserveTiersSql, [...args, encoded, total]);
      sql(insertReservationItemsSql, [key, encoded]);
      db.exec("COMMIT");
      return booking;
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  assert.ok(reserve(now), "Day-two signup succeeds");
  assert.ok(reserve(event.ends_at - 1), "Signup succeeds one millisecond before end");
  assert.equal(reserve(now), undefined, "Full event rejects additional signup");
  db.prepare("UPDATE events SET capacity=NULL WHERE id=?").run(event.id);
  assert.equal(reserve(event.ends_at), undefined, "Exact end time rejects signup even with unlimited capacity");
  assert.equal(reserve(event.ends_at + 1), undefined);
  db.prepare("UPDATE events SET registration_ends_at=? WHERE id=?").run(now + 300000, event.id);
  assert.ok(reserve(now));
  assert.equal(reserve(now + 300000), undefined, "An explicit deadline still closes signup during an event");

  const tiered = await saveFastEvent({ ...input, title: "رویداد با ردهٔ بلیت", capacity: "2" }, []);
  db.prepare("UPDATE events SET starts_at=?,ends_at=? WHERE id=?").run(now - day, now + 2 * day, tiered.id);
  const tierId = randomUUID();
  db.prepare("INSERT INTO event_ticket_tiers(id,event_id,name,price,capacity) VALUES(?,?,?,1000,1)").run(tierId, tiered.id, "عمومی");
  const items = [{ tierId, quantity: 1 }];
  const hold = reserve(now, tiered.id, items, 1000);
  assert.equal(hold.status, "hold", "Paid tier signup can begin on day two");
  assert.equal(reserve(now, tiered.id, items, 1000), undefined, "Tier capacity remains enforced");
  db.prepare("UPDATE events SET registration_ends_at=? WHERE id=?").run(now, tiered.id);
  assert.ok(sql(confirmSql, [hold.id, "day-two-payment", now + 1]), "A pre-deadline hold can confirm during the event after its signup deadline");
  db.prepare("UPDATE event_ticket_tiers SET capacity=NULL WHERE id=?").run(tierId);
  assert.equal(reserve(now, tiered.id, items, 1000), undefined, "Tier signup honors an explicit deadline");
  db.prepare("UPDATE events SET registration_ends_at=NULL WHERE id=?").run(tiered.id);
  const lastHold = reserve(now + 2 * day - 1, tiered.id, items, 1000);
  assert.ok(lastHold);
  assert.equal(sql(confirmSql, [lastHold.id, "ended-payment", now + 2 * day]), undefined, "Payment cannot allocate tickets after event end");
  db.prepare("UPDATE events SET capacity=NULL WHERE id=?").run(tiered.id);
  assert.equal(reserve(now + 2 * day, tiered.id, items, 1000), undefined);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  console.log("PASS real SQLite signup on day two, event/tier capacity, explicit and exact-end cutoffs, and payment confirmation");
} finally {
  adapter?.prepare("").connection.close();
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
