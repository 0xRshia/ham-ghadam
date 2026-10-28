import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { setTimeout } from "node:timers/promises";
import { nodeSourceModules } from "./node-source-module.mjs";
import { organizerAgreement } from "./legal-fixtures.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "event-coordinates-"));
process.env.DATABASE_PATH = path.join(directory, "events.sqlite");
process.env.MEDIA_PATH = path.join(directory, "media");
process.env.HOST_PHONES = "09990000001";
process.env.TEMP_LOGIN_ENABLED = "false";
process.env.SEED_SAMPLE_EVENTS = "false";
const load = nodeSourceModules(path.join(directory, "modules"));
const db = new DatabaseSync(process.env.DATABASE_PATH);
db.exec("PRAGMA foreign_keys=ON");
let adapter;

try {
  const { entries } = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
  for (const { tag } of entries) db.exec(fs.readFileSync(`drizzle/${tag}.sql`, "utf8"));
  db.prepare("INSERT INTO users(id,phone,name,created_at) VALUES('coordinate-host','09990000001','برگزارکنندهٔ آزمون',?)").run(Date.now());
  adapter = (await load("db/node.ts")).database();
  const { hashPassword } = await load("lib/passwords.ts");
  const { hash } = await load("lib/server.ts");
  const { persianInput } = await load("lib/persian-date.ts");
  const { readEventInput } = await load("lib/event-input.ts");
  const { hasEventCoordinates } = await load("lib/event-catalog.ts");
  const sessionRoute = await load("app/api/fast/session/route.ts");
  const eventsRoute = await load("app/api/fast/events/route.ts");
  const eventRoute = await load("app/api/fast/events/[id]/route.ts");
  const catalogRoute = await load("app/api/events/route.ts");
  const publicRoute = await load("app/api/events/[id]/route.ts");
  const hostRoute = await load("app/api/host/route.ts");
  const origin = "https://coordinate-tests.example.test";
  const password = randomBytes(20).toString("hex");
  process.env.FAST_ADMIN_USERNAME = "coordinate-tests";
  process.env.FAST_ADMIN_PASSWORD_HASH = await hashPassword(password);
  let cookie = "";
  async function call(handler, method, route, data, id, expected = 200, requestCookie = cookie) {
    if (method !== "GET") await setTimeout(110);
    const multipart = data instanceof FormData;
    const response = await handler(new Request(origin + route, {
      method,
      headers: { Origin: origin, Cookie: requestCookie, ...(data && !multipart ? { "Content-Type": "application/json" } : {}) },
      ...(data ? { body: multipart ? data : JSON.stringify(data) } : {}),
    }), { params: Promise.resolve({ id }) });
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(result)}`);
    return { result, response };
  }
  const login = await call(sessionRoute.POST, "POST", "/api/fast/session", { username: process.env.FAST_ADMIN_USERNAME, password });
  cookie = login.response.headers.get("set-cookie").split(";")[0];
  const date = persianInput(Date.now() + 3 * 86400000);
  const shortUrl = "https://maps.app.goo.gl/CoordinateTestPlace";
  const coordinateUrl = "https://www.google.com/maps/search/?api=1&query=35.75%2C51.4";
  const input = {
    title: "آزمون مختصات رویداد", description: "بررسی مختصات واقعی نقشه", category: "books",
    host_id: "coordinate-host", venue: "محل آزمون", address: "نشانی آزمون", city: "تهران",
    maps_url: shortUrl, date, time: "18:00", endDate: date, endTime: "20:00", capacity: "10",
  };
  async function create(changes = {}, multipart = false) {
    let data = { ...input, ...changes };
    if (multipart) {
      const body = new FormData();
      body.set("data", JSON.stringify(data));
      data = body;
    }
    return (await call(eventsRoute.POST, "POST", "/api/fast/events", data, undefined, 201)).result.event;
  }
  async function update(event, changes = {}, expected = 200) {
    return (await call(eventRoute.PUT, "PUT", `/api/fast/events/${event.id}`,
      { ...input, maps_url: event.maps_url, revision: event.revision, published: !!event.published, ...changes }, event.id, expected)).result.event;
  }
  const coordinates = event => [event.lat, event.lng];
  const stored = id => coordinates(db.prepare("SELECT lat,lng FROM events WHERE id=?").get(id));
  const valid = [
    [{ lat: 35.7, lng: 51.4 }, [35.7, 51.4]],
    [{ lat: " 35.75 ", lng: "-51.4" }, [35.75, -51.4]],
    [{ lat: "۳۵٫۷۵", lng: "٥١٫٤" }, [35.75, 51.4]],
    [{ lat: 0, lng: "0" }, [0, 0]],
    [{ lat: -90, lng: 180 }, [-90, 180]],
    [{ lat: "90", lng: "-180" }, [90, -180]],
  ];
  for (const [pair, expected] of valid) {
    const event = await create({ maps_url: coordinateUrl, ...pair }, typeof pair.lat === "string");
    assert.deepEqual(coordinates(event), expected, "Explicit coordinates override URL coordinates through JSON and multipart routes");
    assert.deepEqual(stored(event.id), expected, "The database stores the accepted coordinates");
  }
  const invalid = [
    { lat: 35 }, { lng: 51 }, { lat: 35, lng: "" }, { lat: null, lng: 51 },
    { lat: 90.001, lng: 51 }, { lat: -90.001, lng: 51 }, { lat: 35, lng: 180.001 }, { lat: 35, lng: -180.001 },
    { lat: "NaN", lng: 51 }, { lat: 35, lng: "Infinity" }, { lat: "0x23", lng: 51 },
    { lat: true, lng: 51 }, { lat: 35, lng: false }, { lat: {}, lng: 51 }, { lat: 35, lng: [] },
    { lat: "35,7", lng: 51 }, { lat: "35 7", lng: 51 },
  ];
  const countBefore = db.prepare("SELECT COUNT(*) count FROM events").get().count;
  for (const pair of invalid) {
    await call(eventsRoute.POST, "POST", "/api/fast/events", { ...input, ...pair }, undefined, 400);
  }
  for (const pair of [{ lat: NaN, lng: 51 }, { lat: 35, lng: Infinity }, { lat: -Infinity, lng: 0 }]) {
    assert.throws(() => readEventInput({ ...input, ...pair }), error => error.status === 400,
      "Nonfinite in-memory numbers fail before JSON can turn them into null");
  }
  assert.equal(db.prepare("SELECT COUNT(*) count FROM events").get().count, countBefore, "Invalid coordinate submissions create no event");
  console.log("PASS JSON/multipart coordinate persistence, Persian/Arabic decimal input, zero/boundaries and invalid-pair rejection");

  let event = await create({ lat: 35.7, lng: 51.4 });
  event = await update(event, { lat: "36.25", lng: "52.75" });
  assert.deepEqual(coordinates(event), [36.25, 52.75], "Explicit coordinates can be edited");
  event = await update(event, { description: "ویرایش توضیح بدون تغییر مختصات" });
  assert.deepEqual(coordinates(event), [36.25, 52.75], "Older clients that omit coordinates preserve the existing point");
  event = await update(event, { maps_url: coordinateUrl });
  assert.deepEqual(coordinates(event), [35.75, 51.4], "Changing a URL without explicit coordinates retains URL extraction");
  event = await update(event, { lat: 36, lng: 52 });
  event = await update(event, { lat: "", lng: "" });
  assert.deepEqual(coordinates(event), [35.75, 51.4], "Clearing both fields derives coordinates from the unchanged URL again");
  event = await update(event, { maps_url: shortUrl, lat: null, lng: null });
  assert.deepEqual(coordinates(event), [null, null], "Clearing coordinates with a short link never invents a point");
  event = await update(event, { lat: 0, lng: 0, published: true });
  const publicEvent = (await call(publicRoute.GET, "GET", `/api/events/${event.id}`, undefined, event.id, 200, "")).result.event;
  const catalog = (await call(catalogRoute.GET, "GET", "/api/events", undefined, undefined, 200, "")).result.events;
  const mapEvent = catalog.find(item => item.id === event.id);
  assert.deepEqual(coordinates(publicEvent), [0, 0]);
  assert.deepEqual(coordinates(mapEvent), [0, 0]);
  assert.equal(hasEventCoordinates(mapEvent), true, "The published catalog supplies the coordinate pair accepted by the existing map");
  console.log("PASS editing, legacy omission, URL changes, explicit clearing and public map-catalog coordinates");

  for (const [index, pair] of [[null, null], [null, 51.4], [35.7, null]].entries()) {
    const created = await create({ maps_url: coordinateUrl });
    db.prepare("UPDATE events SET lat=?,lng=? WHERE id=?").run(...pair, created.id);
    let legacy = (await call(eventRoute.GET, "GET", `/api/fast/events/${created.id}`, undefined, created.id)).result.event;
    legacy = await update(legacy, { description: "حفظ مختصات قدیمی هنگام ویرایش توضیح" });
    assert.deepEqual(coordinates(legacy), pair, "An omitted pair preserves legacy null/incomplete coordinates despite a coordinate-bearing URL");
    db.prepare("INSERT INTO reservations(id,user_id,event_id,quantity,total,amount_rial,status,request_key,created_at,payment_state) VALUES(?,'coordinate-host',?,1,0,0,'cancelled',?,?,'none')")
      .run(`legacy-coordinate-history-${index}`, legacy.id, `legacy-coordinate-history-${index}`, Date.now());
    legacy = await update(legacy, { description: "ویرایش مجاز توضیح با حفظ مکان قفل‌شدهٔ قدیمی" });
    assert.deepEqual(coordinates(legacy), pair, "Omitted coordinates allow safe content edits after legacy reservation history");
    assert.deepEqual(stored(legacy.id), pair, "Safe edits never fill or discard stored legacy coordinates");
  }
  console.log("PASS unchanged legacy null/incomplete coordinates survive ordinary and reservation-locked description edits");

  db.prepare("INSERT INTO reservations(id,user_id,event_id,quantity,total,amount_rial,status,request_key,created_at,payment_state) VALUES('coordinate-history','coordinate-host',?,1,0,0,'cancelled','coordinate-history',?,'none')").run(event.id, Date.now());
  const revisionBefore = db.prepare("SELECT revision FROM events WHERE id=?").get(event.id).revision;
  await update(event, { lat: 35.7, lng: 51.4 }, 409);
  await update(event, { lat: "", lng: "" }, 409);
  assert.deepEqual(stored(event.id), [0, 0], "Reservation history prevents coordinate replacement and clearing");
  assert.equal(db.prepare("SELECT revision FROM events WHERE id=?").get(event.id).revision, revisionBefore, "Rejected coordinate edits preserve the revision");
  event = await update(event, { description: "ویرایش مجاز توضیح رویداد دارای سابقه" });
  assert.deepEqual(stored(event.id), [0, 0], "Safe edits still preserve locked coordinates");

  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,'coordinate-host',?)").run(await hash(token), Date.now() + 60000);
  const host = await call(hostRoute.POST, "POST", "/api/host", {
    ...input, organizerAgreement, lat: "۳۵٫۷۵", lng: "۵۱٫۴",
  }, undefined, 201, `hg_session=${token}`);
  assert.deepEqual(stored(host.result.id), [35.75, 51.4], "Host creation shares the same explicit-coordinate contract");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  console.log("PASS reservation-history locks, safe content edits and host creation using the shared coordinate contract");
} finally {
  adapter?.prepare("SELECT 1").connection.close();
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
