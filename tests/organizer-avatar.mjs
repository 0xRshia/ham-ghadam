import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout } from "node:timers/promises";
import { nodeSourceModules } from "./node-source-module.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "organizer-avatar-"));
process.env.DATABASE_PATH = path.join(directory, "app.sqlite");
process.env.MEDIA_PATH = path.join(directory, "media");
process.env.FAST_ADMIN_USERNAME = "avatar-test";
process.env.APP_ORIGIN = "https://avatar.example.test";
delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
delete process.env.INSTAGRAM_GRAPH_ACCESS_TOKEN;
delete process.env.INSTAGRAM_GRAPH_API_VERSION;
const load = nodeSourceModules(path.join(directory, "modules"));
const db = new DatabaseSync(process.env.DATABASE_PATH);
const originalFetch = globalThis.fetch;
const bytes = new Uint8Array(fs.readFileSync("public/images/cafe.jpg"));
const id = "instagram:fixture";
let cookie = "";
const origin = process.env.APP_ORIGIN;
try {
  db.exec("PRAGMA foreign_keys=ON");
  const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) db.exec(fs.readFileSync(`drizzle/${entry.tag}.sql`, "utf8"));
  db.prepare("INSERT INTO organizers(id,name,instagram_handle,created_at) VALUES(?,?,?,1)").run(id, "گالری آزمون", "gallery.test");
  const { hashPassword } = await load("lib/passwords.ts");
  process.env.FAST_ADMIN_PASSWORD_HASH = await hashPassword("avatar-test-password");
  const sessionRoute = await load("app/api/fast/session/route.ts");
  const route = await load("app/api/fast/organizers/[id]/avatar/route.ts");
  const publicRoute = await load("app/api/organizer-media/[id]/route.ts");
  const domain = await load("lib/organizer-avatar.ts");
  const remote = await load("lib/instagram-avatar.ts");
  const { getOrganizer } = await load("lib/organizers.ts");
  async function call(handler, method, { data, requestCookie = cookie, requestOrigin = origin, targetId = id } = {}) {
    if (method !== "GET") await setTimeout(110);
    return handler(new Request(`${origin}/api/fast/organizers/${encodeURIComponent(targetId)}/avatar`, {
      method, headers: { Origin: requestOrigin, Cookie: requestCookie, ...(data && !(data instanceof FormData) ? { "Content-Type": "application/json" } : {}) },
      ...(data ? { body: data instanceof FormData ? data : JSON.stringify(data) } : {}),
    }), { params: Promise.resolve({ id: targetId }) });
  }
  const login = await call(sessionRoute.POST, "POST", { data: { username: process.env.FAST_ADMIN_USERNAME, password: "avatar-test-password" } });
  assert.equal(login.status, 200);
  cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await call(route.GET, "GET", { requestCookie: "" })).status, 401);
  assert.equal((await call(route.POST, "POST", { requestOrigin: "https://other.test" })).status, 403);
  assert.equal((await call(route.GET, "GET", { targetId: "missing" })).status, 404);
  const noConfig = await (await call(route.GET, "GET")).json();
  assert.deepEqual(noConfig, { url: null, source: null, instagramConfigured: false, instagramHandle: "gallery.test" });
  assert.equal((await call(route.POST, "POST")).status, 503);

  function form(content = bytes, type = "image/jpeg") {
    const data = new FormData(); data.set("data", "{}"); data.set("cover", new File([content], "profile.jpg", { type })); return data;
  }
  assert.equal((await call(route.PUT, "PUT", { data: form(new Uint8Array([1, 2, 3])) })).status, 400);
  let response = await call(route.PUT, "PUT", { data: form() });
  assert.equal(response.status, 201);
  const uploaded = await response.json();
  assert.equal(uploaded.source, "upload");
  assert.match(uploaded.url, /^\/api\/organizer-media\/[a-f0-9-]+$/);
  const mediaId = uploaded.url.split("/").at(-1);
  const readImage = (imageId = mediaId, requestCookie = "") => publicRoute.GET(new Request(`${origin}/api/organizer-media/${imageId}`, { headers: { Cookie: requestCookie } }), { params: Promise.resolve({ id: imageId }) });
  assert.equal((await readImage()).status, 404, "Draft portrait is not anonymously public");
  assert.equal((await readImage(mediaId, cookie)).status, 200, "Authenticated editor can preview a draft portrait");
  db.prepare("INSERT INTO events(id,organizer_id,title,description,category,venue,address,city,price,published,sample) VALUES(?,?,?,?,?,?,?,?,0,1,0)")
    .run("avatar-event", id, "رویداد", "شرح", "books", "محل", "نشانی", "تهران");
  response = await readImage();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.equal((await getOrganizer(id, null)).avatar_url, uploaded.url);
  assert.equal((await call(route.POST, "POST")).status, 409, "Automatic import does not overwrite manual upload");
  console.log("PASS organizer portraits: authenticated upload, media validation, publication boundary and shared public profile");

  assert.equal((await call(route.DELETE, "DELETE")).status, 200);
  assert.equal((await readImage()).status, 404);
  assert.equal((await getOrganizer(id, null)).avatar_url, null);
  const removedKey = db.prepare("SELECT 1 FROM organizer_media WHERE organizer_id=?").get(id);
  assert.equal(removedKey, undefined);
  assert.ok(fs.readdirSync(process.env.MEDIA_PATH).length, "Replaced/deleted objects remain available to earlier DB snapshots");
  process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = "17841400000000001";
  process.env.INSTAGRAM_GRAPH_ACCESS_TOKEN = "test-server-only-access-token";
  process.env.INSTAGRAM_GRAPH_API_VERSION = "v25.0";
  assert.ok(remote.instagramAvatarConfig());
  for (const value of ["http://scontent.cdninstagram.com/photo.jpg", "https://cdninstagram.com.evil.test/photo.jpg", "https://localhost/photo.jpg", "https://127.0.0.1/photo.jpg", "https://user:pass@scontent.cdninstagram.com/photo.jpg", "https://scontent.cdninstagram.com:8443/photo.jpg", "javascript:alert(1)"])
    assert.equal(remote.instagramImageUrl(value), null);
  assert.ok(remote.instagramImageUrl("https://scontent.cdninstagram.com/photo.jpg"));
  assert.ok(remote.instagramImageUrl("https://scontent-lhr1-1.xx.fbcdn.net/photo.jpg"));
  let calls = [];
  const cdn = "https://scontent.cdninstagram.com/photo.jpg?expires=temporary";
  function network({ mismatch = false, redirect = null, change = null, malformed = false, oversized = false } = {}) {
    calls = [];
    globalThis.fetch = async (input, init) => {
      const url = new URL(input); calls.push({ url: url.href, init });
      if (url.hostname === "graph.facebook.com") {
        assert.equal(init.headers.Authorization, `Bearer ${process.env.INSTAGRAM_GRAPH_ACCESS_TOKEN}`);
        assert.equal(url.searchParams.has("access_token"), false);
        assert.equal(url.searchParams.get("fields"), "business_discovery.username(gallery.test){username,profile_picture_url}");
        return new Response(JSON.stringify({ business_discovery: { username: mismatch ? "different.account" : "gallery.test", profile_picture_url: cdn } }));
      }
      assert.equal(url.href, cdn, "Remote portrait fetches only the returned strict Meta CDN URL");
      if (change) await change();
      if (redirect) return new Response(null, { status: 302, headers: { Location: redirect } });
      return new Response(malformed ? "<svg/>" : bytes, { headers: { "Content-Type": malformed ? "image/svg+xml" : "image/jpeg", ...(oversized ? { "Content-Length": "5242881" } : {}) } });
    };
  }
  network();
  response = await call(route.POST, "POST");
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const imported = await response.json();
  assert.equal(imported.source, "instagram");
  assert.equal(calls.length, 2);
  assert.equal(db.prepare("SELECT instagram_handle FROM organizer_media WHERE organizer_id=?").get(id).instagram_handle, "gallery.test");
  const serialized = JSON.stringify(imported);
  assert.ok(!serialized.includes(process.env.INSTAGRAM_GRAPH_ACCESS_TOKEN) && !serialized.includes("cdninstagram"));
  assert.equal((await call(route.POST, "POST")).status, 200);
  assert.equal(calls.length, 2, "Fresh imported portrait is served from durable storage without a second provider request");
  assert.deepEqual(new Uint8Array(await (await readImage(imported.url.split("/").at(-1))).arrayBuffer()), bytes);
  console.log("PASS official Business Discovery import: server-only token, returned identity, durable CDN-independent image and 24h cache");

  for (const scenario of [{ mismatch: true }, { redirect: "http://127.0.0.1/private" }, { malformed: true }, { oversized: true }]) {
    network(scenario);
    await assert.rejects(remote.fetchInstagramAvatar("gallery.test"), error => error.status === 502);
    assert.ok(calls.length <= 2);
  }
  await assert.rejects(remote.fetchInstagramAvatar("bad){username}"), error => error.status === 400);
  console.log("PASS provider identity mismatch, unsafe redirect, oversized response and invalid image all fail without storing an avatar");

  db.prepare("DELETE FROM organizer_media WHERE organizer_id=?").run(id);
  db.prepare("DELETE FROM rate_limits WHERE key=?").run(`organizer-instagram-avatar:${id}`);
  const beforeFiles = fs.readdirSync(process.env.MEDIA_PATH).length;
  network({ change: async () => { await domain.saveOrganizerAvatar(await domain.avatarOrganizer(id), { bytes, contentType: "image/jpeg" }, "upload"); } });
  response = await call(route.POST, "POST");
  assert.equal(response.status, 409);
  assert.equal(db.prepare("SELECT source FROM organizer_media WHERE organizer_id=?").get(id).source, "upload");
  assert.equal(fs.readdirSync(process.env.MEDIA_PATH).length, beforeFiles + 1, "Failed remote replacement cleans up only its new file");
  db.prepare("DELETE FROM organizer_media WHERE organizer_id=?").run(id);
  db.prepare("DELETE FROM rate_limits WHERE key=?").run(`organizer-instagram-avatar:${id}`);
  network({ change: () => db.prepare("UPDATE organizers SET instagram_handle='renamed' WHERE id=?").run(id) });
  response = await call(route.POST, "POST");
  assert.equal(response.status, 409);
  assert.equal(db.prepare("SELECT * FROM organizer_media WHERE organizer_id=?").get(id), undefined);
  assert.equal(fs.readdirSync(process.env.MEDIA_PATH).length, beforeFiles + 1);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  console.log("PASS concurrent manual upload and changed Instagram identity cannot be overwritten; rejected images are compensated");

  const adapter = (await load("db/node.ts")).database();
  const prepare = adapter.prepare.bind(adapter);
  function loseCommitResponse(alsoLoseVerification) {
    adapter.prepare = sql => {
      const statement = prepare(sql);
      if (!sql.startsWith("INSERT INTO organizer_media") && !(alsoLoseVerification && sql.startsWith("SELECT id FROM organizer_media WHERE id=? AND storage_key=?"))) return statement;
      const bind = statement.bind.bind(statement);
      statement.bind = (...values) => {
        const bound = bind(...values);
        const first = bound.first.bind(bound);
        bound.first = async () => {
          if (sql.startsWith("INSERT")) await first(); // Real SQLite commit, then the transport loses its response.
          throw new Error("Simulated lost D1 response");
        };
        return bound;
      };
      return statement;
    };
  }
  try {
    loseCommitResponse(false);
    response = await call(route.PUT, "PUT", { data: form() });
    assert.equal(response.status, 201, "A committed reference recovers upload success after a lost response");
    let saved = db.prepare("SELECT storage_key FROM organizer_media WHERE organizer_id=?").get(id);
    assert.ok(fs.existsSync(path.join(process.env.MEDIA_PATH, saved.storage_key)));
    loseCommitResponse(true);
    response = await call(route.PUT, "PUT", { data: form() });
    assert.equal(response.status, 503, "Uncertain commit is reported honestly when verification also fails");
    saved = db.prepare("SELECT storage_key FROM organizer_media WHERE organizer_id=?").get(id);
    assert.ok(fs.existsSync(path.join(process.env.MEDIA_PATH, saved.storage_key)), "Uncertain commit never deletes an image referenced by the database");
  } finally { adapter.prepare = prepare; }
  console.log("PASS lost mutation responses and failed outcome verification preserve committed image files");
} finally {
  globalThis.fetch = originalFetch;
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
