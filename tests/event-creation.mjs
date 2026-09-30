import assert from "node:assert/strict";
import fs from "node:fs";

export async function testLocationLinks({ call, base, host, check, createdIds, now }) {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now + 86400000);
  const date = ["year", "month", "day"].map(type => parts.find(part => part.type === type).value).join("/");
  const eventForm = {
    title: "آزمایش پیوند محل برگزاری", description: "اعتبارسنجی پیوند در پایگاه دادهٔ آزمون",
    venue: "محل آزمایش", city: "تهران", date, time: "18:00", endTime: "20:00",
    registrationDate: date, registrationTime: "17:00", price: "0", capacity: "12", category: "art",
  };
  async function submit(maps_url, format) {
    const data = { ...eventForm, maps_url };
    if (format === "JSON") return call("/api/host", data, host.token);
    const body = new FormData();
    body.set("data", JSON.stringify(data));
    const response = await fetch(base + "/api/host", {
      method: "POST", body, headers: { Origin: base, Cookie: `hg_session=${host.token}` },
      signal: AbortSignal.timeout(10000),
    });
    return { status: response.status, data: await response.json() };
  }
  const coordinateUrl = "https://www.google.com/maps/search/?api=1&query=35.75%2C51.4";
  for (const format of ["JSON", "multipart"]) {
    for (const url of [
      coordinateUrl, "https://maps.app.goo.gl/ExampleSharedPlace", "https://maps.apple.com/?q=Tehran#place",
      "https://neshan.org/maps/places/venue", "https://balad.ir/location?lat=35&lng=51",
      "https://goo.gl/AnyShortLink", "https://example.com/venue?ref=event#directions",
      "http://example.com:8080/location?query=35%2C51#arrival",
    ]) {
      const result = await submit(url, format);
      check(result.status === 201, `${format} event creation accepts ${url}`);
      createdIds.push(result.data.id);
      const saved = (await call(`/api/events/${result.data.id}`)).data.event;
      check(saved.maps_url === url && saved.lat === (url === coordinateUrl ? 35.75 : null) &&
        saved.lng === (url === coordinateUrl ? 51.4 : null),
      `${format} preserves the destination and extracts only supported Google coordinates`);
    }
    for (const url of ["", null, "example.com/location", "https:///example.com", "javascript:alert(1)",
      "data:text/html,test", "file:///etc/passwd", "https://user:pass@example.com/location",
      "https://example.com/\nplace", "https://example.com/" + "a".repeat(2048)]) {
      check((await submit(url, format)).status === 400, `${format} rejects invalid or unsafe location input`);
    }
  }
}

export async function testEventCreation({ db, call, base, host, guest, eventForm, check, createdIds, startPreview, vars, nodeRuntime, mediaPath }) {
  const coverBytes = fs.readFileSync("public/images/cafe.jpg");
  const firstBytes = fs.readFileSync("public/images/books.jpg");
  const secondBytes = fs.readFileSync("public/images/games.jpg");
  const photo = (bytes, type = "image/jpeg") => new Blob([bytes], { type });
  const form = (data = eventForm, cover, gallery = []) => {
    const result = new FormData();
    result.set("data", JSON.stringify(data));
    if (cover) result.append("cover", cover, "cover.jpg");
    for (const image of gallery) result.append("gallery", image, "gallery.jpg");
    return result;
  };
  async function submit(body, token = host.token, origin = base) {
    const response = await fetch(base + "/api/host", {
      method: "POST", body,
      headers: { Origin: origin, ...(token ? { Cookie: `hg_session=${token}` } : {}) },
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: text }; }
    return { status: response.status, data };
  }
  async function create(body) {
    const result = await submit(body);
    assert.equal(result.status, 201, JSON.stringify(result.data));
    createdIds.push(result.data.id);
    return (await call(`/api/events/${result.data.id}`)).data.event;
  }
  for (const maps_url of ["", "javascript:alert(1)", "file:///etc/passwd", "https://user@example.com/location"]) {
    check((await call("/api/host", { ...eventForm, maps_url }, host.token)).status === 400,
      `Host creation rejects invalid location URL: ${maps_url || "missing"}`);
  }
  for (const change of [{ time: "22:00", endTime: "21:00" }, { time: "18:00", endTime: "18:00" }, { time: "24:00" }]) {
    check((await call("/api/host", { ...eventForm, ...change }, host.token)).status === 400,
      "Host creation rejects invalid or unordered times");
  }
  const withoutPhotos = await create(form({ ...eventForm, maps_url: "https://maps.app.goo.gl/ExampleSharedPlace", address: undefined }));
  check(withoutPhotos.lat === null && withoutPhotos.lng === null && withoutPhotos.image === null && withoutPhotos.thumbnail === null && withoutPhotos.gallery.length === 0 && withoutPhotos.address === "",
    "A shared Maps link creates a real image-free event without invented coordinates or mandatory directions");
  check((await call("/api/events")).data.events.some((event) => event.id === withoutPhotos.id && event.city === eventForm.city),
    "Coordinate-less event remains in its city's catalog");
  const galleryOnly = await create(form(eventForm, undefined, [photo(firstBytes), photo(secondBytes)]));
  check(galleryOnly.image === null && galleryOnly.gallery.length === 2 && galleryOnly.thumbnail === galleryOnly.gallery[0].url,
    "Gallery-only event uses first ordered gallery image as card thumbnail without fabricating a cover");
  const coverOnly = await create(form(eventForm, photo(coverBytes)));
  check(coverOnly.image === coverOnly.thumbnail && coverOnly.gallery.length === 0,
    "Cover-only event has a banner and no gallery");
  const complete = await create(form(eventForm, photo(coverBytes), [photo(firstBytes), photo(secondBytes)]));
  check(complete.gallery.length === 2 && complete.image === complete.thumbnail && complete.image !== complete.gallery[0].url,
    "Separate cover and ordered gallery are retained in the detail API");
  check(complete.lat === 35.75 && complete.lng === 51.4 && complete.maps_url === eventForm.maps_url,
    "Only explicit Maps query coordinates populate distance data");
  const catalogEvent = (await call("/api/events")).data.events.find((event) => event.id === complete.id);
  check(catalogEvent.thumbnail === complete.image && !Object.hasOwn(catalogEvent, "gallery"),
    "Catalog returns thumbnail metadata without eagerly loading all gallery photos");
  const stored = db.prepare("SELECT * FROM event_media WHERE event_id=? ORDER BY role,position").all(complete.id);
  check(stored.length === 3 && stored.every((row) => row.byte_size > 0 && row.content_type === "image/jpeg"),
    "Uploaded media metadata is attached to the committed event");
  async function assertImage(url, expected) {
    const response = await fetch(base + url);
    check(response.status === 200 && response.headers.get("content-type") === "image/jpeg" && response.headers.get("x-content-type-options") === "nosniff",
      "Media endpoint serves verified image MIME with nosniff");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
  }
  await assertImage(complete.image, coverBytes);
  await assertImage(complete.gallery[0].url, firstBytes);
  await assertImage(complete.gallery[1].url, secondBytes);
  await call("/api/host", { action: "publish", id: complete.id, published: false }, host.token);
  check((await call(`/api/events/${complete.id}`)).status === 404, "Paused event detail remains hidden");
  await assertImage(complete.image, coverBytes);
  await call("/api/host", { action: "publish", id: complete.id, published: true }, host.token);
  for (const [token, status] of [[undefined, 401], [guest.token, 403]]) {
    const denied = await submit(form(eventForm, photo(coverBytes)), token ?? "");
    check(denied.status === status, `Media creation requires an authorized host (${denied.status}: ${JSON.stringify(denied.data)})`);
  }
  check((await submit(form(eventForm, photo(coverBytes)), host.token, "https://evil.test")).status === 403,
    "Cross-origin media submission is rejected");
  check((await fetch(base + "/api/media/../../etc/passwd")).status === 404,
    "Media route cannot address filesystem paths");
  const before = db.prepare("SELECT COUNT(*) n FROM event_media").get().n;
  for (const [body, expected] of [
    [form(eventForm, photo(Buffer.from("<svg onload='alert(1)'></svg>"), "image/svg+xml")), 400],
    [form(eventForm, photo(coverBytes.subarray(0, 50))), 400],
    [form(eventForm, photo(coverBytes, "image/png")), 400],
    [form(eventForm, photo(Buffer.alloc(5 * 1024 * 1024 + 1))), 413],
    [form(eventForm, undefined, Array.from({ length: 7 }, () => photo(coverBytes))), 400],
    [form(eventForm, undefined, Array.from({ length: 5 }, () => photo(Buffer.alloc(5 * 1024 * 1024)))), 413],
  ]) {
    const rejected = await submit(body);
    check(rejected.status === expected,
      `Invalid, oversized, mismatched, or excessive images are rejected (${rejected.status}, expected ${expected}: ${JSON.stringify(rejected.data)})`);
  }
  const duplicateCover = form(eventForm, photo(coverBytes));
  duplicateCover.append("cover", photo(firstBytes), "second.jpg");
  check((await submit(duplicateCover)).status === 400, "More than one cover is rejected");
  check(db.prepare("SELECT COUNT(*) n FROM event_media").get().n === before, "Rejected submissions create no media rows");

  const filesBeforeFailure = nodeRuntime ? fs.readdirSync(mediaPath).sort() : [];
  db.exec("CREATE TRIGGER fail_event_media BEFORE INSERT ON event_media BEGIN SELECT RAISE(ABORT,'forced constraint failure'); END");
  try {
    check((await submit(form({ ...eventForm, title: "Media rollback check" }, photo(coverBytes)))).status === 503,
      "A database failure is reported instead of publishing a partial event");
    check(!db.prepare("SELECT id FROM events WHERE title='Media rollback check'").get(), "Event and media metadata roll back together");
    if (nodeRuntime) assert.deepEqual(fs.readdirSync(mediaPath).sort(), filesBeforeFailure, "Files from confirmed failed save are removed");
  } finally { db.exec("DROP TRIGGER fail_event_media"); }
  await startPreview(vars);
  await assertImage(complete.gallery[0].url, firstBytes);
  check((await call(`/api/events/${complete.id}`)).data.event.gallery.length === 2, "Gallery metadata and bytes survive a process restart");
  if (nodeRuntime) {
    await startPreview({ ...vars, MEDIA_PATH: "" });
    check((await submit(form(eventForm, photo(coverBytes)))).status === 503, "Unconfigured storage fails clearly for uploads");
    const plain = await create(form(eventForm));
    check(plain.image === null, "Without storage configuration, events without photos still publish");
    await startPreview(vars);
  }
  return complete;
}
