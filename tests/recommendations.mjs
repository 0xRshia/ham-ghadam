import { withLocaleModules } from "./locale-module.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

export async function testRecommendations({ db, call, event, user, check, now, root }) {
  const source = ts.transpileModule(
    fs.readFileSync(path.join(root, "lib/recommendations.ts"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const recommendationsUrl = "data:text/javascript;base64," + Buffer.from(source).toString("base64");
  const { rankSuggestions, visibleSuggestions } = await import(recommendationsUrl);
  const typesSource = ts.transpileModule(withLocaleModules(fs.readFileSync(path.join(root, "lib/types.ts"), "utf8")), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const typesUrl = "data:text/javascript;base64," + Buffer.from(typesSource).toString("base64");
  const catalogSource = ts.transpileModule(fs.readFileSync(path.join(root, "lib/event-catalog.ts"), "utf8")
    .replaceAll('"./types"', JSON.stringify(typesUrl))
    .replaceAll('"./recommendations"', JSON.stringify(recommendationsUrl)), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const { filterEvents, groupEvents, defaultCatalogFilters } = await import(
    "data:text/javascript;base64," + Buffer.from(catalogSource).toString("base64"),
  );
  const migrationDatabase = new DatabaseSync(":memory:");
  try {
    const entries = JSON.parse(fs.readFileSync(path.join(root, "drizzle/meta/_journal.json"), "utf8")).entries;
    migrationDatabase.exec(fs.readFileSync(path.join(root, "drizzle", entries[0].tag + ".sql"), "utf8"));
    migrationDatabase.prepare("INSERT INTO events(id,host_id,title,description,category,venue,address,city,lat,lng,starts_at,ends_at,price,capacity,image) VALUES('legacy','host','Existing event','','books','','','',0,0,1,2,0,NULL,'')").run();
    for (const entry of entries.slice(1)) {
      migrationDatabase.exec(fs.readFileSync(path.join(root, "drizzle", entry.tag + ".sql"), "utf8"));
    }
    const legacy = migrationDatabase.prepare("SELECT title,created_at FROM events WHERE id='legacy'").get();
    check(legacy.title === "Existing event" && legacy.created_at === null,
      "Additive migration preserves existing events without fabricating creation dates");
  } finally {
    migrationDatabase.close();
  }

  const viewer = user(40), buyer = user(41), newcomer = user(42);
  const city = "شهر آزمون پیشنهاد";
  const fixtureIds = new Set();
  function candidate(name, options = {}) {
    const id = event("suggestion-" + name, options.capacity ?? null, options.price ?? 50000);
    fixtureIds.add(id);
    db.prepare("UPDATE events SET category=?,city=?,created_at=?,starts_at=?,ends_at=?,published=?,sample=? WHERE id=?")
      .run(options.category ?? "games", options.city ?? city,
        options.createdAt === undefined ? now - 50000 : options.createdAt,
        options.start ?? now + 86400000, (options.start ?? now + 86400000) + 7200000,
        options.published ?? 1, options.sample ?? 0, id);
    return id;
  }
  function booking(owner, eventId, options = {}) {
    const total = options.total ?? 0;
    db.prepare("INSERT INTO reservations(id,user_id,event_id,quantity,total,amount_rial,status,request_key,created_at,expires_at,payment_state) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run(crypto.randomUUID(), owner.id, eventId, options.quantity ?? 1, total, total * 10,
        options.status ?? "confirmed", crypto.randomUUID(), options.createdAt ?? now - 10000,
        options.expiresAt ?? null, total > 0 ? "paid" : "none");
  }
  const musicHistory = candidate("past-music", { category: "music", start: now - 86400000 });
  booking(viewer, musicHistory, { createdAt: now - 40000 });
  const anotherMusic = candidate("past-music-two", { category: "music", start: now - 86400000 });
  booking(viewer, anotherMusic, { createdAt: now - 30000 });
  const booksHistory = candidate("past-books", { category: "books", start: now - 86400000 });
  booking(viewer, booksHistory, { quantity: 6, createdAt: now - 20000 });
  booking(viewer, booksHistory, { quantity: 6, createdAt: now - 19000 });
  const artHistory = candidate("past-art", { category: "art", start: now - 86400000 });
  booking(viewer, artHistory, { createdAt: now - 18000 });
  for (const status of ["hold", "cancelled", "failed", "paid_unfulfilled"]) {
    const ignored = candidate("ignored-" + status, { category: "coffee", start: now - 86400000 });
    booking(viewer, ignored, { status, total: 50000, quantity: 6, createdAt: now - 1000 });
  }

  const music = candidate("music", { category: "music" });
  const art = candidate("art", { category: "art" });
  const books = candidate("books", { category: "books" });
  const hot = candidate("hot", { createdAt: now - 80000, price: 0 });
  booking(buyer, hot, { total: 100000, quantity: 6 });
  const secondHot = candidate("second-hot", { createdAt: now - 1000 });
  for (let i = 0; i < 3; i++) booking(buyer, secondHot, { total: 50000 });
  const newest = candidate("newest", { category: "coffee", createdAt: now - 100 });
  db.prepare("UPDATE events SET title=? WHERE id=?").run("رویداد تازه قهوه", newest);
  for (const status of ["hold", "cancelled", "failed", "paid_unfulfilled"]) {
    booking(buyer, newest, { status, total: 500000, quantity: 100 });
  }
  const freePopular = candidate("free-popular", { category: "coffee", price: 0 });
  booking(buyer, freePopular, { quantity: 100 });
  const legacy = candidate("legacy", { createdAt: null });
  const owned = candidate("owned", { category: "music" });
  booking(viewer, owned);
  const soldOut = candidate("sold-out", { capacity: 1 });
  booking(buyer, soldOut, { total: 50000 });
  const held = candidate("held", { capacity: 1 });
  booking(buyer, held, { status: "hold", expiresAt: now + 900000 });
  const expiredHold = candidate("expired-hold", { capacity: 1 });
  booking(buyer, expiredHold, { status: "hold", expiresAt: now - 1000 });
  const paused = candidate("paused", { published: 0 });
  const sample = candidate("sample", { sample: 1 });
  const tiedFirst = candidate("tie-a", { createdAt: now - 70000 });
  const tiedSecond = candidate("tie-b", { createdAt: now - 70000 });
  const sooner = candidate("sooner", { createdAt: now - 70000, start: now + 7200000 });

  const anonymous = await call("/api/events");
  check(anonymous.status === 200 && Array.isArray(anonymous.data.events) && Array.isArray(anonymous.data.suggestions),
    "Catalog preserves events and includes ordered suggestion references for guests");
  check(anonymous.headers.get("cache-control") === "private, no-store" && anonymous.headers.get("vary").toLowerCase().split(",").map((value) => value.trim()).includes("cookie"),
    "Personalized catalog is private, uncached, and varies by session cookie");
  const positions = (response) => response.data.suggestions.map((item) => item.eventId);
  const guestOrder = positions(anonymous);
  const reason = (response, id) => response.data.suggestions.find((item) => item.eventId === id)?.reason;
  check(guestOrder.indexOf(hot) < guestOrder.indexOf(secondHot) && reason(anonymous, hot) === "popular",
    "Popularity counts confirmed paid ticket quantities, using payment snapshots rather than current prices");
  check(guestOrder.indexOf(secondHot) < guestOrder.indexOf(newest) && guestOrder.indexOf(newest) < guestOrder.indexOf(freePopular),
    "Hottest events precede latest events, and free registrations do not inflate paid popularity");
  check(reason(anonymous, newest) === "latest" && reason(anonymous, legacy) === null && guestOrder.indexOf(newest) < guestOrder.indexOf(legacy),
    "Known creation dates rank ahead of legacy events without misleading new-event labels");
  check(guestOrder.indexOf(sooner) < guestOrder.indexOf(tiedFirst) && guestOrder.indexOf(tiedFirst) < guestOrder.indexOf(tiedSecond),
    "Ties resolve by earliest event start and then stable event ID");
  check(guestOrder.includes(expiredHold) && !guestOrder.includes(soldOut) && !guestOrder.includes(held) && !guestOrder.includes(paused) && !guestOrder.includes(musicHistory),
    "Suggestions exclude past, unpublished, sold-out, and fully held events while expired holds release capacity");
  const seeded = anonymous.data.events.filter((item) => item.sample === 1 && !fixtureIds.has(item.id));
  check(seeded.length > 0 && seeded.every((item) => item.created_at >= now),
    "New sample initialization records actual creation timestamps");

  const personalized = await call("/api/events", undefined, viewer.token);
  const personalOrder = positions(personalized);
  check(personalOrder.indexOf(music) < personalOrder.indexOf(art) && personalOrder.indexOf(art) < personalOrder.indexOf(books) && personalOrder.indexOf(books) < personalOrder.indexOf(hot),
    "Confirmed free bookings teach interests: distinct event counts win, with recent bookings breaking category ties");
  check(reason(personalized, newest) === "latest" && [music, art, books].every((id) => reason(personalized, id) === "category"),
    "Unsuccessful booking statuses do not teach category preferences");
  check(!personalOrder.includes(owned) && guestOrder.includes(owned),
    "Already confirmed events are excluded only for their booking owner");
  const partial = visibleSuggestions(personalized.data.events.filter((item) => [music, hot, newest].includes(item.id)), personalized.data.suggestions);
  check(partial.map((item) => item.reason).join(",") === "category,popular,latest",
    "Partial category matches fill remaining slots with hottest and latest events");
  const fresh = await call("/api/events", undefined, newcomer.token);
  check(JSON.stringify(fresh.data.suggestions) === JSON.stringify(anonymous.data.suggestions),
    "Signed-in users without confirmed history receive the same fallback as guests");
  const other = await call("/api/events", undefined, buyer.token);
  check(!positions(other).includes(hot) && personalOrder.includes(hot) && !JSON.stringify(personalized.data).includes(viewer.id) && !JSON.stringify(personalized.data).includes(buyer.id),
    "Sessions isolate recommendations and never disclose booking-owner identities or history");
  const invalid = await call("/api/events", undefined, "f".repeat(64));
  check(JSON.stringify(invalid.data.suggestions) === JSON.stringify(anonymous.data.suggestions),
    "Invalid sessions safely receive guest suggestions");

  const unmatchedEvents = anonymous.data.events.filter((item) => [hot, newest].includes(item.id));
  const unmatched = rankSuggestions(unmatchedEvents, [{ event_id: musicHistory, category: "music", last_booked_at: now }], [{ event_id: hot, tickets: 6 }], now);
  check(unmatched[0].eventId === hot && unmatched[0].reason === "popular" && unmatched[1].eventId === newest,
    "A history with no eligible matching categories falls back to popularity and recency");

  candidate("local-extra-one");
  candidate("local-extra-two");
  for (let i = 0; i < 9; i++) {
    const remote = candidate("remote-" + i, { city: "شهر دیگر" });
    booking(buyer, remote, { total: 100000, quantity: 20 + i });
  }
  const expanded = await call("/api/events");
  const visible = expanded.data.events.filter((item) => item.city === city && item.category === "games" && item.price === 50000 && item.starts_at < now + 2 * 86400000);
  const selected = visibleSuggestions(visible, expanded.data.suggestions);
  check(expanded.data.suggestions.length > 8 && selected.length === 8 && selected.every((item) => visible.some((event) => event.id === item.event.id)) && !expanded.data.suggestions.slice(0, 8).some((item) => selected.some((selectedItem) => selectedItem.event.id === item.eventId)),
    "City, category, price, and date filtering happens before limiting to eight suggestions");
  check(JSON.stringify(selected) === JSON.stringify(visibleSuggestions([...visible].reverse(), expanded.data.suggestions)),
    "Changing regular catalog order does not alter recommendation ranking");
  check(visibleSuggestions([], expanded.data.suggestions).length === 0 && rankSuggestions([], [], [], now).length === 0,
    "Empty filters and catalogs produce no fabricated suggestions");

  const catalogFilters = { ...defaultCatalogFilters, city };
  const allCityFiltered = filterEvents(expanded.data.events, defaultCatalogFilters, now);
  check(allCityFiltered.some((item) => item.city === city) &&
    allCityFiltered.some((item) => item.city === "شهر دیگر"),
    "Default catalog includes events from multiple cities when location controls are inactive");
  const filtered = filterEvents(expanded.data.events, catalogFilters, now);
  const groups = groupEvents(filtered, expanded.data.suggestions, now);
  check(groups.all.length === filtered.length && groups.all.length > 8,
    "All-events listing includes every match beyond the home preview limit");
  check(groups.free.every(({ event }) => event.price === 0) && groups.free.some(({ event }) => event.id === hot),
    "Free group contains only zero-price events");
  check(groups.free.every(({ event }) => groups.all.some((item) => item.event.id === event.id)),
    "Group overlaps do not remove free events from the full catalog");
  check(groups.suggested.length === 8 && !groups.suggested.some(({ event }) => event.id === soldOut || event.id === held),
    "Suggested group preserves capacity eligibility and the eight-event cap");
  check(groups.new[0].event.id === newest && !groups.new.some(({ event }) => event.id === legacy) &&
    groups.new.findIndex(({ event }) => event.id === sooner) < groups.new.findIndex(({ event }) => event.id === tiedFirst) &&
    groups.new.findIndex(({ event }) => event.id === tiedFirst) < groups.new.findIndex(({ event }) => event.id === tiedSecond),
    "New group sorts by known creation date, start time and ID, excluding unknown creation dates");
  const freeFiltered = filterEvents(expanded.data.events, { ...catalogFilters, free: true }, now);
  check(freeFiltered.length === groups.free.length && freeFiltered.every((event) => event.price === 0),
    "Free-only filtering applies before every group and on the dedicated free listing");
  const narrowed = filterEvents(expanded.data.events, { ...catalogFilters, category: "coffee", query: "تازه", when: "week" }, now);
  check(narrowed.length === 1 && narrowed[0].id === newest,
    "Shared filters combine category, query, city and date for group and listing results");
  check(Object.values(groupEvents([], [], now)).every((items) => items.length === 0),
    "An empty catalog leaves every group empty");

  const published = db.prepare("SELECT id FROM events WHERE published=1").all();
  try {
    db.prepare("UPDATE events SET published=0").run();
    const empty = await call("/api/events", undefined, viewer.token);
    check(empty.status === 200 && empty.data.events.length === 0 && empty.data.suggestions.length === 0,
      "Empty catalog API returns empty event and suggestion lists");
  } finally {
    const restore = db.prepare("UPDATE events SET published=1 WHERE id=?");
    for (const item of published) restore.run(item.id);
  }
  return sample;
}
