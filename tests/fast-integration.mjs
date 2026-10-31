import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import ts from "typescript";

export async function testFast({ db, base, host, guest, other, check, createdIds, startPreview, vars, nodeRuntime, mediaPath }) {
  const compiled = ts.transpileModule(fs.readFileSync("lib/passwords.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { hashPassword } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  const password = crypto.randomBytes(20).toString("hex");
  const username = `fast-${crypto.randomUUID()}`;
  const configured = { ...vars, SEED_SAMPLE_EVENTS: "false", HOST_PHONES: `${host.phone},${other.phone}`, FAST_ADMIN_USERNAME: username, FAST_ADMIN_PASSWORD_HASH: await hashPassword(password), EVENT_SYNC_JOB_SECRET: crypto.randomBytes(32).toString("hex"),
    // HTTP tests exercise local portrait storage only, never the real Meta API.
    INSTAGRAM_BUSINESS_ACCOUNT_ID: "", INSTAGRAM_GRAPH_ACCESS_TOKEN: "", INSTAGRAM_GRAPH_API_VERSION: "" };
  let cookie = "";
  async function request(route, data, method = data === undefined ? "GET" : "POST", options = {}) {
    if (options.resetLimits !== false) db.prepare("UPDATE rate_limits SET last_at=0 WHERE key LIKE 'fast-%'").run();
    const multipart = data instanceof FormData;
    const response = await fetch(base + route, {
      method, redirect: "manual",
      headers: { ...(data === undefined || multipart ? {} : { "Content-Type": "application/json" }), ...(method === "GET" ? {} : { Origin: options.origin ?? base }), ...(options.cookie ?? cookie ? { Cookie: options.cookie ?? cookie } : {}), ...(options.authorization ? { Authorization: options.authorization } : {}) },
      body: data === undefined ? undefined : multipart ? data : JSON.stringify(data), signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch { result = { text }; }
    return { status: response.status, data: result, headers: response.headers };
  }
  function status(result, expected, message) { check(result.status === expected, `${message} (${result.status}${result.status !== expected ? ": " + JSON.stringify(result.data).slice(0, 240) : ""})`); return result.data; }
  async function login() {
    db.prepare("DELETE FROM rate_limits WHERE key LIKE 'fast-login:%'").run();
    const result = await request("/api/fast/session", { username, password });
    status(result, 200, "Dedicated credentials authenticate");
    return result.headers.get("set-cookie").split(";")[0];
  }
  const date = value => {
    const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
    return ["year", "month", "day"].map(type => parts.find(part => part.type === type).value).join("/");
  };
  const clock = value => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);
  const day = date(Date.now() + 3 * 86400000);
  const input = { title: "رویداد مدیریت دستی", description: "آزمون یکپارچه‌سازی پنل مستقل", category: "books", host_id: host.id, venue: "محل آزمون", address: "نشانی آزمون", city: "تهران", maps_url: "https://maps.app.goo.gl/IntegrationPlace", date: day, time: "18:00", endDate: day, endTime: "20:00", registrationDate: day, registrationTime: "17:00", price: "0", capacity: "20" };
  function payload(event, changes = {}) {
    return { ...input, ...Object.fromEntries(["title", "description", "category", "host_id", "venue", "address", "city", "maps_url", "price", "capacity"].map(key => [key,event[key]])),
      date: date(event.starts_at), time: clock(event.starts_at), endDate: date(event.ends_at), endTime: clock(event.ends_at), registrationDate: event.registration_ends_at === null ? null : date(event.registration_ends_at), registrationTime: event.registration_ends_at === null ? null : clock(event.registration_ends_at), revision: event.revision, published: !!event.published, ...changes };
  }
  const jpeg = fs.readFileSync("public/images/cafe.jpg");
  const galleryJpeg = fs.readFileSync("public/images/books.jpg");
  function multipart(data, cover, gallery = []) {
    const body = new FormData(); body.set("data", JSON.stringify(data));
    if (cover) body.set("cover", new Blob([cover], { type: "image/jpeg" }), "cover.jpg");
    for (const file of gallery) body.append("gallery", new Blob([file], { type: "image/jpeg" }), "gallery.jpg");
    return body;
  }
  async function create(data = input) {
    const result = status(await request("/api/fast/events", data), 201, "Admin creates a complete event");
    createdIds.push(result.event.id); return result.event;
  }
  async function read(id) { return status(await request(`/api/fast/events/${id}`), 200, "Admin reads event detail").event; }
  async function update(event, changes = {}) { return request(`/api/fast/events/${event.id}`, payload(event, changes), "PUT"); }

  status(await request("/api/fast/session", { username, password }), 503, "Unconfigured credentials fail closed");
  const anonymous = await request("/fast");
  check([302,303,307].includes(anonymous.status) && anonymous.headers.get("location").includes("/fast/login"), "Server redirects unauthenticated admin pages");
  await startPreview(configured);
  status(await request("/api/fast/events", undefined, "GET", { cookie: `hg_session=${host.token}` }), 401, "A host session cannot access fast administration");
  status(await request("/api/fast/session", { username, password: password + "wrong" }), 401, "Wrong passwords are rejected");
  status(await request("/api/fast/session", { username: username + "wrong", password }), 401, "Wrong usernames are rejected with the same status");
  status(await request("/api/fast/session", { username, password }, "POST", { origin: "https://evil.test" }), 403, "Login requires the same Origin");
  cookie = await login();
  check(!db.prepare("SELECT hash FROM fast_sessions WHERE hash=?").get(cookie.split("=")[1]), "Raw session tokens are never persisted");
  const cookieResponse = await request("/api/fast/session", { username, password });
  check(/HttpOnly/.test(cookieResponse.headers.get("set-cookie")) && /SameSite=Strict/.test(cookieResponse.headers.get("set-cookie")) && /Max-Age=28800/.test(cookieResponse.headers.get("set-cookie")), "Session cookie has the eight-hour security attributes");
  status(await request("/api/admin/content"), 401, "Fast credentials do not grant unrelated admin access");
  const organizers = status(await request("/api/fast/organizers"), 200, "Organizer directory loads").organizers;
  check(organizers.some(item => item.id === host.id) && organizers.some(item => item.id === other.id) && !organizers.some(item => item.id === guest.id), "Organizer choices include registered hosts without requiring published events");
  status(await request("/fast/events/new"), 200, "Authenticated event editor renders on localhost");
  const syncStatus = status(await request("/api/fast/event-sync"),200,"Authenticated sheet sync settings load");
  check(syncStatus.settings.persian_year===1405 && syncStatus.settings.sheet_url.includes("gid=1283818652"),"Sheet source and fixed Persian year are persisted defaults");
  status(await request("/api/fast/event-sync",undefined,"GET",{cookie:`hg_session=${host.token}`}),401,"Host cookies cannot read independent sync settings");
  status(await request("/api/fast/event-sync",{sheet_url:"https://evil.test/sheet",persian_year:1405,revision:syncStatus.settings.revision},"PUT"),400,"Unapproved sheet sources are rejected before fetching");
  status(await request("/api/fast/event-sync/run",{},"POST",{origin:"https://evil.test"}),403,"Cross-origin sync triggers are rejected");
  status(await request("/api/jobs/event-sync",{}),401,"Sync job requires its separate Bearer secret");
  db.prepare("UPDATE event_sync_settings SET next_scheduled_at=? WHERE id=1").run(Date.now()+86400000);
  const queuedSync = status(await request("/api/fast/event-sync/run",{}),202,"Admin queues a durable sync run");
  check(status(await request("/api/fast/event-sync/run",{}),202,"Repeated sync triggers share the active run").active.id===queuedSync.active.id,"Concurrent sync requests do not create duplicate runs");
  // Resume the persisted state immediately after a validated empty snapshot, without external network access.
  db.prepare("UPDATE event_sync_runs SET status='importing',total=0 WHERE id=?").run(queuedSync.active.id);
  const syncTick=status(await request("/api/jobs/event-sync",{},"POST",{authorization:`Bearer ${configured.EVENT_SYNC_JOB_SECRET}`}),200,"Authenticated worker resumes and reconciles persisted sync state");
  check(!syncTick.hasMore && status(await request("/api/fast/event-sync"),200,"Completed sync status loads").latest.status==="completed","Sync lease guard and reconciliation execute on the active runtime database");
  status(await request("/api/fast/events", { ...input, host_id: guest.id }), 400, "Non-host organizers are rejected");
  status(await request("/api/fast/events", { ...input, maps_url: "javascript:alert(1)" }), 400, "Unsafe location links are rejected");
  status(await request("/api/fast/events", { ...input, price: "100" }), 400, "Invalid paid prices are rejected");
  status(await request("/api/fast/events", { ...input, endTime: "17:00" }), 400, "Unordered event times are rejected");
  status(await request("/api/fast/events", input, "POST", { origin: "https://evil.test" }), 403, "Cross-origin creation is rejected");
  const withoutTeaser = await create();
  check(withoutTeaser.teaser === null, "New events may omit the teaser");
  const teaserUrl = "https://www.instagram.com/reel/FastTeaser/?igsh=shared";
  let teaserEvent = await create(multipart({ ...input, teaser: teaserUrl, published: true }));
  check(teaserEvent.teaser === teaserUrl, "Multipart event creation persists an Instagram teaser");
  check(status(await request(`/api/events/${teaserEvent.id}`, undefined, "GET", { cookie: "" }), 200, "Public teaser event is readable").event.teaser === teaserUrl, "Public detail exposes the teaser URL");
  teaserEvent = status(await update(teaserEvent), 200, "Admin can omit teaser on edit").event;
  check(teaserEvent.teaser === teaserUrl, "Omitting teaser preserves it");
  for (const teaser of ["javascript:alert(1)", "https://user:pass@example.test/video", 42])
    status(await request("/api/fast/events", { ...input, teaser }), 400, "Invalid teaser input is rejected");
  for (const teaser of ["https://media.example.test/teaser.mp4?token=signed", "", teaserUrl, null]) {
    teaserEvent = status(await update(teaserEvent, { teaser }), 200, "Admin can replace or clear a teaser").event;
    check(teaserEvent.teaser === (teaser || null), "Saved teaser matches the requested replacement or removal");
  }
  let plain = await create({ ...input, teaser_url: "https://instagram.com/reel/FirstHttpTeaser/?igsh=tracking#preview" });
  check(plain.published === 0 && plain.sample === 0 && plain.lat === null && plain.lng === null && plain.image === null, "Creation defaults to a real draft without invented media or coordinates");
  check(plain.teaser_url === "https://www.instagram.com/reel/FirstHttpTeaser/", "HTTP event creation canonicalizes the teaser and removes tracking");
  status(await update(plain, { teaser_url: "https://instagram.com/profile_only/" }), 400, "Teaser fields reject a profile URL instead of storing it as a post");
  plain = status(await request(`/api/fast/events/${plain.id}`, multipart(payload(plain, { teaser_url: "https://instagram.com/p/EditedHttpTeaser/?igsh=tracking" })), "PUT"), 200, "Multipart event editing saves a post teaser").event;
  plain = status(await update(plain), 200, "Legacy HTTP editors can omit a saved teaser").event;
  check(plain.teaser_url === "https://www.instagram.com/p/EditedHttpTeaser/" && db.prepare("SELECT teaser_url FROM events WHERE id=?").get(plain.id).teaser_url === plain.teaser_url, "Omitted teaser survives editing and reaches persisted event data");
  status(await request(`/api/events/${plain.id}`, undefined, "GET", { cookie: "" }), 404, "Draft events are hidden publicly");
  const overnight = await create({ ...input, endDate: date(Date.now() + 4 * 86400000), endTime: "02:00" });
  check(overnight.ends_at > overnight.starts_at + 6 * 3600000, "Manual creation supports an overnight schedule");
  const weekly = {kind:"weekly",date:day,endDate:date(Date.now()+18*86400000),weekdays:[5],sessions:[{start:"11:00",end:"13:00"},{start:"14:00",end:"16:00"}]};
  let recurring = await create({...input,title:"کارگاه هفتگی",schedule:weekly,registrationDate:null,registrationTime:null,published:true});
  check(recurring.starts_at===null && recurring.ends_at===null && recurring.schedule.source==="manual", "Weekly slots persist without a fabricated continuous event window");
  const publicRecurring = status(await request(`/api/events/${recurring.id}`,undefined,"GET",{cookie:""}),200,"Public recurring detail loads").event;
  check(publicRecurring.schedule.sessions.length===2 && publicRecurring.schedule.date_text.includes("جمعه"), "Public detail exposes the authored weekday and both sessions");
  recurring = status(await update(recurring,{description:"توضیح تازهٔ کارگاه"}),200,"Editing content preserves an omitted schedule").event;
  check(recurring.schedule.sessions.length===2,"Persisted slots survive a legacy editor request");
  status(await request(`/api/fast/events/${recurring.id}/program`,{revision:0,agenda:[],series_id:null,video_url:"https://example.test/workshop.mp4"},"PUT"),200,"Recurring events can save a video without a timed agenda");
  status(await request("/api/fast/events",{...input,schedule:{...weekly,sessions:[{start:"11:00",end:"13:00"},{start:"12:00",end:"14:00"}]},registrationDate:null,registrationTime:null}),400,"Overlapping slots are rejected over HTTP");
  recurring = status(await update(recurring,{schedule:{...weekly,kind:"sessions",weekdays:[],endDate:null}}),200,"Weekly schedule can become daily slots").event;
  check(recurring.schedule.dates.length===1 && recurring.schedule.weekdays.length===0,"Daily slots replace the recurrence rule");
  let optional = await create({ ...input, registrationDate: undefined, registrationTime: undefined, endDate: date(Date.now() + 6 * 86400000) });
  check(optional.registration_ends_at === null, "New events can omit a signup deadline");
  optional = status(await request(`/api/fast/events/${optional.id}`, payload(optional, { registrationDate: date(Date.now() + 4 * 86400000), registrationTime: "18:00" }), "PUT"), 200, "Signup deadline may fall during a multi-day event").event;
  check(optional.registration_ends_at > optional.starts_at, "Deadline after start persists");
  optional = status(await request(`/api/fast/events/${optional.id}`, payload(optional, { registrationDate: "", registrationTime: "" }), "PUT"), 200, "Clearing a signup deadline persists").event;
  check(optional.registration_ends_at === null, "Removed deadline is returned as null");
  const list = status(await request(`/api/fast/events?status=draft&host_id=${host.id}&q=${encodeURIComponent(input.title)}`), 200, "Filtered event list loads");
  check(list.items.some(item => item.id === plain.id) && list.items.every(item => item.published === 0 && typeof item.canDelete === "boolean"), "Filters and list permission flags reflect persisted data");
  status(await request("/api/fast/events?status=invalid"), 400, "Unknown list status is rejected");
  status(await request("/api/fast/events?page=0"), 400, "Pagination is validated");

  let photos = await create(multipart({ ...input, coverAction: "replace" }, jpeg, [galleryJpeg,jpeg]));
  const untypedImages = multipart({ ...input, host_id: null, organizer_name: "برگزارکنندهٔ تصویر بدون نوع", coverAction: "replace", galleryItems: [{ uploadIndex: 0 }] });
  untypedImages.set("cover", new Blob([jpeg]), "camera.jpg");
  untypedImages.append("gallery", new Blob([galleryJpeg], { type: "application/octet-stream" }), "gallery.jpg");
  const untypedEvent = await create(untypedImages);
  check(!!untypedEvent.image && untypedEvent.gallery.length === 1, "Real images with absent or generic MIME metadata persist for an independent organizer");
  const untypedCover = await fetch(base + untypedEvent.image, { headers: { Cookie: cookie } });
  check(untypedCover.ok && untypedCover.headers.get("content-type") === "image/jpeg", "Uploaded generic files are served using their verified image type");
  assert.deepEqual(Buffer.from(await untypedCover.arrayBuffer()), jpeg);
  const oldCover = photos.image;
  const oldKeys = db.prepare("SELECT storage_key FROM event_media WHERE event_id=?").all(photos.id);
  check(photos.gallery.length === 2 && !!photos.image, "Cover and ordered gallery persist together");
  const updatedPhotos = status(await request(`/api/fast/events/${photos.id}`, multipart(payload(photos, { coverAction: "remove", galleryItems: [{ mediaId: photos.gallery[1].id },{ uploadIndex: 0 }] }), undefined, [galleryJpeg]), "PUT"), 200, "Admin removes cover, removes/reorders gallery and adds an image atomically").event;
  check(updatedPhotos.image === null && updatedPhotos.gallery.length === 2 && updatedPhotos.gallery[0].id === photos.gallery[1].id, "Final gallery order matches the explicit image manifest");
  photos = updatedPhotos;
  if (nodeRuntime) check(oldKeys.every(row => fs.existsSync(`${mediaPath}/${row.storage_key}`)), "Previously committed immutable files remain available to backups");
  status(await request(`/api/fast/events/${plain.id}`, payload(plain, { galleryItems: [{ mediaId: photos.gallery[0].id }] }), "PUT"), 400, "Images from another event cannot be attached");
  const invalidImage = status(await request("/api/fast/events", multipart({ ...input, coverAction: "replace" }, Buffer.from("<svg></svg>"))), 400, "Forged image payloads are rejected");
  check(invalidImage.error.includes("cover.jpg"), "Image validation identifies the rejected filename");
  status(await request("/api/fast/events", multipart(input, undefined, Array.from({ length: 7 }, () => jpeg))), 400, "More than six gallery uploads are rejected");
  const filesBefore = nodeRuntime ? fs.readdirSync(mediaPath).sort() : [];
  const metadataBefore = db.prepare("SELECT * FROM event_media WHERE event_id=? ORDER BY id").all(photos.id);
  db.exec("CREATE TRIGGER fail_fast_media BEFORE INSERT ON event_media BEGIN SELECT RAISE(ABORT,'forced admin media failure'); END");
  try {
    const failed = status(await request(`/api/fast/events/${photos.id}`, multipart(payload(photos, { title: "must roll back", coverAction: "replace" }), jpeg), "PUT"), 503, "Failed media commit reports failure");
    check(failed.error.includes("شناسهٔ پیگیری") && !failed.error.includes("forced admin media failure"), "Unexpected save failures include a support reference without internal database details");
    check(db.prepare("SELECT title FROM events WHERE id=?").get(photos.id).title === photos.title, "Failed metadata insertion rolls back event fields");
    assert.deepEqual(db.prepare("SELECT * FROM event_media WHERE event_id=? ORDER BY id").all(photos.id), metadataBefore);
    if (nodeRuntime) assert.deepEqual(fs.readdirSync(mediaPath).sort(), filesBefore);
  } finally { db.exec("DROP TRIGGER fail_fast_media"); }
  const secondCookie = await login();
  const concurrent = await Promise.all([
    request(`/api/fast/events/${plain.id}`, payload(plain, { title: "ویرایش نخست" }), "PUT", { cookie }),
    request(`/api/fast/events/${plain.id}`, payload(plain, { title: "ویرایش دوم" }), "PUT", { cookie: secondCookie }),
  ]);
  assert.deepEqual(concurrent.map(result => result.status).sort(), [200,409]);
  check(true, "Concurrent editors cannot overwrite one another");
  const stale = plain; plain = await read(plain.id);
  status(await update(stale), 409, "A stale version is rejected");
  status(await request(`/api/fast/events/${plain.id}`, { revision: plain.revision, published: true }, "PATCH"), 200, "Admin publishes a completed draft");
  plain = await read(plain.id);
  const publicPlain = status(await request(`/api/events/${plain.id}`, undefined, "GET", { cookie: "" }), 200, "Published events use the existing public detail API").event;
  check(publicPlain.teaser_url === "https://www.instagram.com/p/EditedHttpTeaser/", "The public HTTP detail returns the canonical saved teaser");
  plain = status(await update(plain, { teaser_url: null }), 200, "An explicit null clears the teaser through HTTP").event;
  check(plain.teaser_url === null && status(await request(`/api/events/${plain.id}`, undefined, "GET", { cookie: "" }), 200, "Cleared public detail remains available").event.teaser_url === null, "Removed teasers disappear from both editor and public responses");
  const series = status(await request("/api/fast/event-series", { host_id: host.id, title: "سری پنل مدیریت" }), 201, "Admin creates a series for the organizer").series;
  const agenda = { id: crypto.randomUUID(), title: "بخش برنامه", speaker: "برگزارکننده", image_url: null, starts_at: plain.starts_at, ends_at: plain.ends_at };
  const programInput = { video_url: null, series_id: series.id, agenda: [agenda], revision: 0 };
  status(await request(`/api/fast/events/${plain.id}/program`, programInput, "PUT"), 200, "Agenda and series settings share the existing program rules");
  status(await request(`/api/fast/events/${plain.id}/program`, programInput, "PUT"), 409, "Stale agenda revisions are rejected");
  status(await update(plain, { endTime: "19:00" }), 409, "A schedule cannot exclude existing agenda sections");
  status(await request("/api/host", { action: "publish", id: plain.id, published: false }, "POST", { cookie: `hg_session=${host.token}` }), 200, "Existing host publication remains compatible");
  status(await update(plain), 409, "Host publication invalidates a stale admin editor");
  plain = await read(plain.id);
  status(await request(`/api/host/events/${plain.id}/scanner`, {}, "POST", { cookie: `hg_session=${host.token}` }), 200, "Original host creates a scanner link");
  plain = status(await update(plain, { host_id: other.id }), 200, "Organizer can be reassigned before bookings").event;
  check(plain.program.series_id === null && !db.prepare("SELECT event_id FROM event_scanners WHERE event_id=?").get(plain.id), "Organizer reassignment clears series and scanner credentials");
  status(await request(`/api/host/events/${plain.id}/tiers`, undefined, "GET", { cookie: `hg_session=${host.token}` }), 404, "Previous organizer loses host access");
  const tiers = status(await request(`/api/fast/events/${plain.id}/tiers`, { tiers: [{ name: "عمومی", description: "", price: 0, capacity: 10, active: 1 }] }, "PUT"), 200, "Admin can configure ticket tiers").tiers;
  check(tiers.length === 1 && tiers[0].price === 0, "Tier data is stored in the shared ticket inventory");

  let booked = await create({ ...input, published: true, capacity: "10" });
  status(await request("/api/reservations", { eventId: booked.id, quantity: 3, requestKey: crypto.randomUUID() }, "POST", { cookie: `hg_session=${guest.token}` }), 403, "Information-only mode blocks new free checkout server-side");
  // Historic purchases still protect destructive edits after checkout is retired.
  const booking = { reservation: { id: crypto.randomUUID() } };
  db.prepare("INSERT INTO reservations(id,user_id,event_id,quantity,total,amount_rial,status,request_key,created_at,payment_state) VALUES(?,?,?,3,0,0,'confirmed',?,?,'none')")
    .run(booking.reservation.id,guest.id,booked.id,crypto.randomUUID(),Date.now());
  check(!!db.prepare("SELECT id FROM reservations WHERE id=?").get(booking.reservation.id), "Historic checkout fixture is persisted");
  booked = await read(booked.id);
  check(booked.hasReservations && !booked.canDelete, "Reservation history locks destructive changes");
  for (const change of [{ host_id: other.id },{ venue: "مکان دیگر" },{ address: "نشانی دیگر" },{ city: "شیراز" },{ maps_url: "https://example.com/elsewhere" },{ time: "18:05" },{ endTime: "20:05" },{ capacity: "2" }]) {
    status(await update(booked, change), 409, `Booked-event guard rejects ${Object.keys(change)[0]}`);
  }
  booked = status(await update(booked, { title: "عنوان ویرایش‌شده", description: "توضیح تازه", capacity: "12", price: "10000" }), 200, "Content, price and safe capacity remain editable").event;
  check(db.prepare("SELECT total FROM reservations WHERE event_id=?").get(booked.id).total === 0, "Price edits preserve existing purchase totals");
  status(await request(`/api/fast/events/${booked.id}`, { revision: booked.revision }, "DELETE"), 409, "Events with reservation history cannot be permanently deleted");
  booked = status(await request(`/api/fast/events/${booked.id}`, { revision: booked.revision, published: false }, "PATCH"), 200, "Booked events can be unpublished").event;
  status(await request(`/api/reservations/${booking.reservation.id}`, undefined, "GET", { cookie: `hg_session=${guest.token}` }), 200, "Unpublishing preserves access to reservation history");

  let holdEvent = await create({ ...input, price: "1000", capacity: "10" });
  const holdId = crypto.randomUUID();
  db.prepare("INSERT INTO reservations(id,user_id,event_id,quantity,total,amount_rial,status,request_key,created_at,expires_at,payment_state) VALUES(?,?,?,4,4000,40000,'hold',?,?,?,'pending')").run(holdId,guest.id,holdEvent.id,crypto.randomUUID(),Date.now(),Date.now()+60000);
  status(await update(holdEvent, { capacity: "3" }), 409, "Active payment holds count toward capacity");
  db.prepare("UPDATE reservations SET expires_at=? WHERE id=?").run(Date.now()-1,holdId);
  holdEvent = status(await update(holdEvent, { capacity: "3" }), 200, "Expired holds no longer consume capacity").event;
  const oldStart = Math.floor((Date.now()-3*86400000)/300000)*300000;
  db.prepare("UPDATE events SET starts_at=?,ends_at=?,registration_ends_at=? WHERE id=?").run(oldStart,oldStart+3600000,oldStart-3600000,overnight.id);
  const past = await read(overnight.id);
  status(await update(past, { description: "ویرایش توضیح رویداد گذشته" }), 200, "Historical events can be edited without changing their past dates");
  // Legacy imports can retain sub-minute timestamps and a zero deadline.
  db.prepare("UPDATE events SET starts_at=?,ends_at=?,registration_ends_at=0,maps_url=NULL WHERE id=?").run(oldStart+1234,oldStart+3600000+1234,overnight.id);
  const legacy = await read(overnight.id);
  const legacySaved = status(await update(legacy, { description: "حفظ دقیق اطلاعات قدیمی" }), 200, "Legacy dates and missing locations survive an unchanged edit").event;
  check(legacySaved.starts_at === legacy.starts_at && legacySaved.ends_at === legacy.ends_at && legacySaved.registration_ends_at === 0 && legacySaved.maps_url === null, "Minute-resolution controls preserve exact historical timestamps");
  status(await update(legacySaved, { coverAction: ["keep"] }), 400, "Image actions require an actual enum string");
  status(await update(legacySaved, { galleryItems: null }), 400, "An explicit invalid image manifest cannot silently alter media");

  const independent = await create({ ...input, host_id: null, organizer_name: "گروه مستقل", instagram_handle: "@Fast.Public.Organizer", published: true });
  const repeated = await create({ ...input, host_id: null, organizer_name: "همان گروه با نام نمایشی دیگر", instagram_handle: "https://instagram.com/FAST.PUBLIC.ORGANIZER/", published: true });
  check(independent.organizer_id === repeated.organizer_id, "Two events reuse the same case-normalized Instagram identity");
  const sharedProfile = status(await request(`/api/organizers/${encodeURIComponent(independent.organizer_id)}`, undefined, "GET", { cookie: "" }), 200, "External organizer profile is public without a customer account");
  check(sharedProfile.events.length === 2 && sharedProfile.organizer.instagram_handle === "fast.public.organizer", "Shared profile lists both events and its Instagram handle");
  check(!("phone" in sharedProfile.organizer) && !("user_id" in sharedProfile.organizer), "Public organizer responses exclude private account identifiers");

  const portraitRoute = `/api/fast/organizers/${encodeURIComponent(independent.organizer_id)}/avatar`;
  status(await request(portraitRoute, undefined, "GET", { cookie: "" }), 401, "Portrait status requires an independent admin session");
  const noPortrait = status(await request(portraitRoute), 200, "Admin reads shared organizer portrait status");
  check(noPortrait.url === null && noPortrait.source === null && noPortrait.instagramConfigured === false, "An unconfigured integration has no invented portrait");
  status(await request(portraitRoute, undefined, "POST"), 503, "Unconfigured Instagram import fails without making a provider request");
  status(await request(portraitRoute, multipart({}, jpeg), "PUT", { origin: "https://evil.test" }), 403, "Portrait upload requires the same Origin");
  status(await request(portraitRoute, multipart({}, Buffer.from("<svg></svg>")), "PUT"), 400, "Portrait upload rejects a forged image");
  const portrait = status(await request(portraitRoute, multipart({}, jpeg), "PUT"), 201, "Admin uploads a shared organizer portrait through multipart HTTP");
  check(portrait.source === "upload" && /^\/api\/organizer-media\/[a-f0-9-]+$/.test(portrait.url), "Uploaded portrait has a local durable media URL");
  status(await request(portraitRoute, undefined, "POST"), 409, "Automatic import cannot overwrite a manually selected portrait");
  const portraitRecord = db.prepare("SELECT storage_key FROM organizer_media WHERE organizer_id=?").get(independent.organizer_id);
  check(!!portraitRecord && status(await request(portraitRoute), 200, "Saved portrait status is readable").url === portrait.url, "Portrait metadata and status retain the uploaded image");
  for (const event of [independent, repeated]) {
    const detail = status(await request(`/api/events/${event.id}`, undefined, "GET", { cookie: "" }), 200, "A shared organizer event remains public after portrait upload").event;
    check(detail.organizer.avatar_url === portrait.url, "Every event sharing the organizer uses the same uploaded portrait");
  }
  const portraitProfile = status(await request(`/api/organizers/${encodeURIComponent(independent.organizer_id)}`, undefined, "GET", { cookie: "" }), 200, "Shared organizer profile reloads after portrait upload");
  check(portraitProfile.organizer.avatar_url === portrait.url, "The organizer profile returns the portrait instead of event artwork");

  await startPreview(configured);
  const portraitImage = await fetch(base + portrait.url, { signal: AbortSignal.timeout(20000) });
  check(portraitImage.status === 200 && portraitImage.headers.get("content-type") === "image/jpeg" && portraitImage.headers.get("cache-control") === "private, no-cache" && !!portraitImage.headers.get("etag"), "Public portrait bytes remain available with safe headers after restart");
  check(Buffer.from(await portraitImage.arrayBuffer()).equals(jpeg), "Runtime media storage serves the original uploaded portrait bytes");
  const removedPortrait = status(await request(portraitRoute, undefined, "DELETE"), 200, "Admin can remove the shared organizer portrait");
  check(removedPortrait.url === null && removedPortrait.source === null && !db.prepare("SELECT 1 FROM organizer_media WHERE organizer_id=?").get(independent.organizer_id), "Portrait removal clears metadata and returns honest empty status");
  status(await request(portrait.url, undefined, "GET", { cookie: "" }), 404, "A removed portrait is no longer publicly served");
  const profileWithoutPortrait = status(await request(`/api/organizers/${encodeURIComponent(independent.organizer_id)}`, undefined, "GET", { cookie: "" }), 200, "Organizer profile remains public after removing its portrait");
  check(profileWithoutPortrait.organizer.avatar_url === null, "Portrait removal reaches the shared organizer profile");
  if (nodeRuntime) check(fs.existsSync(`${mediaPath}/${portraitRecord.storage_key}`), "Deleted portrait objects remain immutable for earlier database backups");
  photos = await read(photos.id);
  check(photos.gallery.length === 2, "Session and media metadata survive a process restart");
  const image = await fetch(base + photos.gallery[0].url);
  check(image.status === 200 && image.headers.get("content-type") === "image/jpeg", "Uploaded image bytes remain accessible after restart");
  status(await request(`/api/fast/events/${photos.id}`, { revision: photos.revision }, "DELETE"), 200, "Unbooked events can be permanently deleted");
  check(!db.prepare("SELECT id FROM event_media WHERE event_id=?").get(photos.id), "Deletion cascades to image metadata");
  if (nodeRuntime) check(oldKeys.every(row => fs.existsSync(`${mediaPath}/${row.storage_key}`)), "Deletion preserves immutable files needed by in-flight backups");
  status(await request(oldCover), 404, "Removed media metadata is no longer served");
  db.prepare("UPDATE fast_sessions SET expires_at=?").run(Date.now()-1);
  status(await request("/api/fast/events"), 401, "Expired sessions are denied");
  cookie = await login();
  status(await request("/api/fast/session", {}, "DELETE"), 200, "Logout succeeds");
  status(await request("/api/fast/events"), 401, "Logout revokes the server-side token");
  cookie = await login();
  await startPreview({ ...configured, FAST_ADMIN_USERNAME: username + "rotated" });
  status(await request("/api/fast/events"), 401, "Changing username invalidates existing sessions");
  await startPreview(configured);
  cookie = await login();
  await startPreview({ ...configured, FAST_ADMIN_PASSWORD_HASH: await hashPassword(password) });
  status(await request("/api/fast/events"), 401, "Rotating the password hash invalidates existing sessions");
  await startPreview(configured);
  db.prepare("DELETE FROM rate_limits WHERE key LIKE 'fast-login:%'").run();
  const before = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    status(await request("/api/fast/session", { username: `${username}-${attempt}`, password: "wrong" }, "POST", { resetLimits: false }), 401, "Each of the first three attempts checks credentials");
  }
  const limit = db.prepare("SELECT count,resets_at FROM rate_limits WHERE key LIKE 'fast-login:%'").get();
  check(limit.count === 3 && limit.resets_at >= before + 3600000 && limit.resets_at <= Date.now() + 3600000, "Login window allows exactly three attempts over one hour");
  const blocked = await request("/api/fast/session", { username, password }, "POST", { resetLimits: false });
  status(blocked, 429, "The fourth attempt is blocked even with valid credentials");
  check(!blocked.headers.has("set-cookie"), "Blocked login does not issue a session");
  await startPreview(configured);
  status(await request("/api/fast/session", { username, password }, "POST", { resetLimits: false }), 429, "Login limits survive a process restart");
  check(db.prepare("SELECT resets_at FROM rate_limits WHERE key LIKE 'fast-login:%'").get().resets_at === limit.resets_at, "Blocked retries do not extend the login window");
  db.prepare("UPDATE rate_limits SET resets_at=? WHERE key LIKE 'fast-login:%'").run(Date.now());
  status(await request("/api/fast/session", { username, password }, "POST", { resetLimits: false }), 200, "Login succeeds once the one-hour window expires");
  status(await request("/api/fast/session", { username, password }, "POST", { resetLimits: false }), 200, "A second successful login counts toward the limit");
  status(await request("/api/fast/session", { username, password }, "POST", { resetLimits: false }), 200, "A third successful login counts toward the limit");
  status(await request("/api/fast/session", { username, password }, "POST", { resetLimits: false }), 429, "Successful logins cannot bypass the hourly limit");
  db.prepare("DELETE FROM rate_limits WHERE key LIKE 'fast-login:%'").run();
  const concurrentLogins = await Promise.all(Array.from({ length: 8 }, () => request("/api/fast/session", { username: null, password: null }, "POST", { resetLimits: false })));
  assert.deepEqual(concurrentLogins.map(result => result.status).sort(), [401, 401, 401, 429, 429, 429, 429, 429]);
  check(true, "Concurrent attempts cannot exceed the three-attempt limit");
  await startPreview(vars);
}
