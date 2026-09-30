import { withLocaleModules } from "./locale-module.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

function compiledUrl(file, replacements = []) {
  let source = fs.readFileSync(file, "utf8");
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  const compiled = ts.transpileModule(withLocaleModules(source), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
}
const { parseGoogleMapsUrl, googleMapsUrl } = await import(compiledUrl("lib/google-maps.ts"));
const { parseLocationUrl, eventLocationUrl } = await import(compiledUrl("lib/location-url.ts", [
  ['"./google-maps"', JSON.stringify(compiledUrl("lib/google-maps.ts"))],
]));
const { parsePersianDate, persianInput } = await import(compiledUrl("lib/persian-date.ts", [
  ['"./types"', JSON.stringify(compiledUrl("lib/types.ts"))],
]));
for (const value of [
  "https://maps.app.goo.gl/AbCd123", "https://goo.gl/maps/AbCd123",
  "https://www.google.com/maps/place/Tehran/@35.7,51.4,12z",
  "https://www.google.com/maps/search/?api=1&query=Tehran",
  "https://maps.google.com/?q=Tehran", "https://google.com/maps?cid=1234",
]) {
  const location = parseGoogleMapsUrl(value);
  assert.ok(location, value);
  assert.equal(location.lat, null, `No invented latitude: ${value}`);
  assert.equal(location.lng, null, `No invented longitude: ${value}`);
}
for (const value of [
  "", null, 2, "Tehran", "http://maps.app.goo.gl/AbCd", "https://maps.app.goo.gl/",
  "https://www.google.com/maps", "https://www.google.com/search?q=Tehran",
  "https://www.google.com/url?q=https://maps.app.goo.gl/x", "https://goo.gl/Other",
  "https://maps.google.com.evil.test/?q=35,51", "https://google.com@evil.test/maps?q=35,51",
  "https://user@google.com/maps?q=35,51", "https://www.google.com:444/maps?q=35,51",
  "https://www.google.com/maps?q=35,51&q=36,52", "https://www.google.com/maps?q=35,51&query=36,52",
  "https://www.google.com/maps/search/?query=35,51", "https://www.google.com/maps?q=91,51",
  "https://www.google.com/maps?query=35,51", "https://www.google.com/maps/search/@35,51,14z",
  "https://www.google.com/maps/place/%4035,51,14z", "https://www.google.com/maps/search/data=abc",
  "https://www.google.com/maps?q=35,181", "https://www.google.com/maps\\@evil.test?q=35,51",
]) assert.equal(parseGoogleMapsUrl(value), null, `Reject ${value}`);
assert.deepEqual(parseGoogleMapsUrl(googleMapsUrl(35.75, 51.4)), {
  url: googleMapsUrl(35.75, 51.4), lat: 35.75, lng: 51.4,
});
assert.equal(parseGoogleMapsUrl("https://www.google.com/maps/search/?api=1&query=35,51&query_place_id=someplace").lat, null);
assert.equal(parseGoogleMapsUrl("https://www.google.com/maps?q=35,51&cid=123").lat, null);
assert.equal(parseGoogleMapsUrl("https://www.google.com/maps/place/Tehran/@35,51,12z?q=36,52").lat, null);

for (const value of [
  "https://maps.apple.com/?q=Tehran#place", "https://neshan.org/maps/places/venue",
  "https://balad.ir/location?lat=35.7&lng=51.4", "https://goo.gl/AnyShortLink",
  "http://example.com:8080/venue?q=tea%20time&source=map#directions",
  "https://example.com/caf%C3%A9", "https://مثال.ایران/مکان",
  "HTTPS://EXAMPLE.COM/venue", "https://google.com.evil.test/maps?q=35,51",
  "https://www.google.com/url?q=https://maps.app.goo.gl/x",
  "https://www.google.com/maps?q=91,181", "https://maps.app.goo.gl/AbCd123",
]) {
  assert.deepEqual(parseLocationUrl(value), { url: new URL(value).href, lat: null, lng: null },
    `Accept a web destination without guessing coordinates: ${value}`);
}
assert.deepEqual(parseLocationUrl(googleMapsUrl(35.75, 51.4)), parseGoogleMapsUrl(googleMapsUrl(35.75, 51.4)));
assert.equal(parseLocationUrl("  https://example.com/place#venue  ").url, "https://example.com/place#venue");
const longestUrl = "https://example.com/" + "a".repeat(2048 - "https://example.com/".length);
assert.equal(parseLocationUrl(longestUrl).url.length, 2048);
for (const value of [
  "", null, undefined, 2, {}, "example.com/venue", "/venue", "//example.com/venue",
  "javascript:alert(1)", "data:text/html,test", "file:///etc/passwd", "mailto:venue@example.com",
  "geo:35,51", "ftp://example.com/venue", "https:", "https:example.com", "https:/example.com",
  "https:///example.com", "https://?q=place", "https://example.com:99999",
  "https://user:password@example.com/venue", "https://@example.com/venue",
  "https://user@example.com/venue", "https://example.com\\@other.test/venue",
  "https://example.com/venue with space", "https://example.com/\u0000venue",
  "\nhttps://example.com/venue", "https://exa\tmple.com/venue", "https://example.com/venue\u007f",
  "https://example.com/venue\u0085", "https://example.com/venue\u009f", " " + longestUrl,
  longestUrl + "a", "https://example.com/" + "م".repeat(500),
]) assert.equal(parseLocationUrl(value), null, `Reject unsafe, incomplete, or oversized location link: ${String(value)}`);

assert.equal(eventLocationUrl({ maps_url: "https://neshan.org/maps/places/venue", lat: 35, lng: 51 }),
  "https://neshan.org/maps/places/venue", "Stored venue link takes precedence over coordinates");
assert.equal(eventLocationUrl({ maps_url: null, lat: 35.75, lng: 51.4 }), googleMapsUrl(35.75, 51.4));
assert.equal(eventLocationUrl({ maps_url: "javascript:alert(1)", lat: 0, lng: 0 }), googleMapsUrl(0, 0));
for (const [lat, lng] of [[null, null], [35, null], [null, 51], [NaN, 51], [35, Infinity], [91, 51], [35, -181]]) {
  assert.equal(eventLocationUrl({ maps_url: null, lat, lng }), null, "Missing or invalid coordinates do not invent a destination");
}
assert.equal(eventLocationUrl({ maps_url: "javascript:alert(1)", lat: null, lng: null }), null);

for (const input of ["1405/01/01", "1405/06/31", "1405/07/30", "1405/12/29", "1403/12/30"]) {
  const instant = parsePersianDate(input, "00:05");
  assert.ok(Number.isFinite(instant), input);
  assert.equal(persianInput(instant), input);
  assert.equal(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit" }).format(instant), "00:05");
}
for (const [date, time] of [["1404/12/30", "18:00"], ["1405/07/31", "18:00"], ["1405/01/01", "24:00"], ["1405/01/01", "18:60"]])
  assert.ok(Number.isNaN(parsePersianDate(date, time)), `${date} ${time}`);
assert.equal(parsePersianDate("۱۴۰۵/۰۱/۰۱", "۱۸:۰۰"), parsePersianDate("1405/01/01", "18:00"));

const db = new DatabaseSync(":memory:");
try {
  db.exec("PRAGMA foreign_keys=ON");
  const entries = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8")).entries;
  const mapsIndex = entries.findIndex((entry) => entry.tag === "0003_event_maps_media");
  for (const migration of entries.slice(0, mapsIndex)) db.exec(fs.readFileSync(`drizzle/${migration.tag}.sql`, "utf8"));
  db.exec(`
    INSERT INTO users VALUES('migration-user','09900000001','Guest',1);
    INSERT INTO events(id,host_id,title,description,category,venue,address,city,lat,lng,starts_at,ends_at,price,capacity,image,published,sample,created_at)
      VALUES('migration-event','host','Existing event','Description','books','Venue','Address','City',35.75,51.4,1,2,1000,12,'/images/books.jpg',1,0,1);
    INSERT INTO reservations(id,user_id,event_id,quantity,total,amount_rial,status,request_key,created_at,reference,payment_state)
      VALUES('migration-reservation','migration-user','migration-event',1,1000,10000,'confirmed','migration-request',1,'paid-reference','paid');
    INSERT INTO tickets VALUES('migration-ticket','migration-reservation',1,'ticket-secret',1,2);
    INSERT INTO event_scanners VALUES('migration-event','scanner-secret',1);
  `);
  const before = Object.fromEntries(["reservations", "tickets", "event_scanners"].map((table) => [table, db.prepare(`SELECT * FROM ${table}`).all()]));
  db.exec("BEGIN IMMEDIATE");
  for (const migration of entries.slice(mapsIndex)) db.exec(fs.readFileSync(`drizzle/${migration.tag}.sql`, "utf8"));
  db.exec("COMMIT");
  for (const [table, rows] of Object.entries(before)) {
    // Compare every original column; additive migrations may introduce nullable fields.
    const columns = Object.keys(rows[0]).join(",");
    assert.deepEqual(db.prepare(`SELECT ${columns} FROM ${table}`).all(), rows);
  }
  assert.equal(db.prepare("SELECT attendee_email FROM reservations WHERE id='migration-reservation'").get().attendee_email, null);
  const row = db.prepare("SELECT * FROM events WHERE id='migration-event'").get();
  assert.equal(row.maps_url, googleMapsUrl(35.75, 51.4));
  assert.equal(row.image, "/images/books.jpg");
  assert.equal(row.lat, 35.75);
  assert.equal(row.lng, 51.4);
  assert.equal(row.registration_ends_at, row.starts_at - 86400000);
  assert.equal(db.prepare("PRAGMA table_info(events)").all().find((column) => column.name === "registration_ends_at").notnull, 1);
  assert.throws(() => db.exec("UPDATE events SET registration_ends_at=NULL"));
  db.exec("UPDATE events SET lat=NULL,lng=NULL,image=NULL");
  assert.equal(db.prepare("SELECT image FROM events").get().image, null);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.ok(db.prepare("PRAGMA index_list(events)").all().some((index) => index.name === "idx_events_city_start"));
} finally { db.close(); }
console.log("PASS Maps URL validation, honest coordinate extraction, Persian/Tehran dates, and populated event migration preservation");
