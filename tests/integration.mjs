import { testEventProgram } from "./event-program-integration.mjs";
import { testDocumentation } from "./docs-integration.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { testRecommendations } from "./recommendations.mjs";
import { testTicketing } from "./ticketing.mjs";
import { testPaymentBypass } from "./payment-bypass.mjs";
import { testEventCreation, testLocationLinks } from "./event-creation.mjs";
import { testRegistration } from "./registration-integration.mjs";
import { testCommunity } from "./community.mjs";
import { testAccountFeatures } from "./account-features.mjs";
import { testContent } from "./content-integration.mjs";
import webPush from "web-push";
import { testAvatar } from "./avatar-integration.mjs";
import { testEmail } from "./email-integration.mjs";
import { testPush } from "./push-integration.mjs";
import { testEvenline } from "./evenline-integration.mjs";
const base = process.env.TEST_ORIGIN ?? "http://127.0.0.1:5188";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Tests must target loopback",
);
const root = process.cwd();
const nodeRuntime = process.argv.includes("--node");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hamghadam-integration-"));
const persistence = path.join(temp, "state");
const mediaPath = path.join(temp, "media");
const configuration = nodeRuntime
  ? {}
  : JSON.parse(fs.readFileSync("dist/server/wrangler.json", "utf8"));
const secret = crypto.randomBytes(32).toString("hex");
if (!nodeRuntime) {
  configuration.main = path.join(root, "dist/server/index.js");
  configuration.assets.directory = path.join(root, "dist/client");
}
const testVapid = webPush.generateVAPIDKeys();
configuration.vars = {
  VAPID_PUBLIC_KEY: testVapid.publicKey,
  VAPID_PRIVATE_KEY: testVapid.privateKey,
  VAPID_SUBJECT: "mailto:tests@example.test",
  OTP_SECRET: secret,
  NOTIFICATION_JOB_SECRET: secret,
  EMAIL_TOKEN_SECRET: secret,
  RESEND_API_KEY: "",
  EMAIL_FROM: "",
  HOST_PHONES: "09999999000",
  ADMIN_PHONES: "09999999099",
  SEED_SAMPLE_EVENTS: "true",
  ...(nodeRuntime ? { MEDIA_PATH: mediaPath } : {}),
};
const testConfig = path.join(temp, "wrangler.json");
fs.writeFileSync(testConfig, JSON.stringify(configuration));
const cli = path.join(root, "node_modules/wrangler/bin/wrangler.js");
const processEnv = {
  ...process.env,
  WRANGLER_SEND_METRICS: "false",
  CLOUDFLARE_CF_FETCH_ENABLED: "false",
  WRANGLER_LOG_PATH: path.join(temp, "logs"),
  // Concurrent previews must not share service discovery with the test worker.
  WRANGLER_REGISTRY_PATH: path.join(temp, "registry"),
  MINIFLARE_REGISTRY_PATH: path.join(temp, "registry"),
};
const migrations = JSON.parse(
  fs.readFileSync(path.join(root, "drizzle/meta/_journal.json"), "utf8"),
).entries;
for (const entry of nodeRuntime ? [] : migrations) {
  const migration = spawnSync(
    process.execPath,
    [
      cli,
      "d1",
      "execute",
      "DB",
      "--local",
      "--config",
      testConfig,
      "--persist-to",
      persistence,
      "--file",
      path.join(root, "drizzle", `${entry.tag}.sql`),
    ],
    { env: processEnv, encoding: "utf8" },
  );
  assert(migration.status === 0, `Test migration ${entry.tag} must succeed`);
}
const folder = nodeRuntime
  ? temp
  : path.join(persistence, "v3/d1/miniflare-D1DatabaseObject");
const file = nodeRuntime
  ? "test.sqlite"
  : fs
      .readdirSync(folder)
      .find((n) => n.endsWith(".sqlite") && n !== "metadata.sqlite");
assert(file, "Test database exists");
if (nodeRuntime) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = spawnSync(process.execPath, ["scripts/migrate-node.mjs"], {
      env: { ...processEnv, DATABASE_PATH: path.join(folder, file) },
      encoding: "utf8",
    });
    assert.equal(
      result.status,
      0,
      `SQLite migrations must succeed and be repeatable: ${result.stderr}`,
    );
  }
}
const db = new DatabaseSync(path.join(folder, file));
db.exec("PRAGMA foreign_keys=ON;PRAGMA busy_timeout=10000");
const prefix = "test-" + crypto.randomUUID();
let preview;
let previewOutput = "";
const hostPhone = "09999999000";
const now = Date.now();
let checks = 0;
const identities = [];
const sessions = [];
const createdIds = [];
const challengeIds = [];
const digest = (x) => crypto.createHash("sha256").update(x).digest("hex");
function check(value, message) {
  assert(value, message);
  checks++;
  console.log("PASS " + message);
}
function user(i) {
  const id = `${prefix}-u${i}`,
    phone = "0999999" + String(9000 + i).slice(-4),
    token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO users(id,phone,name,created_at) VALUES(?,?,?,?)").run(
    id,
    phone,
    `آزمایش ${i}`,
    now,
  );
  db.prepare("INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,?,?)").run(
    digest(token),
    id,
    now + 3600000,
  );
  identities.push(id);
  sessions.push(token);
  return { id, phone, token };
}
async function call(route, data, token, origin = base) {
  const res = await fetch(base + route, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      ...(data === undefined
        ? {}
        : { "Content-Type": "application/json", Origin: origin }),
      ...(token ? { Cookie: `hg_session=${token}` } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(5000),
  });
  const text = await res.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    result = { error: text };
  }
  return {
    status: res.status,
    data: result,
    cookie: res.headers.get("set-cookie"),
    headers: res.headers,
  };
}
async function stopPreview() {
  if (!preview?.pid || preview.exitCode !== null) return;
  const running = preview;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        process.kill(-running.pid, "SIGKILL");
      } catch {}
      resolve();
    }, 5000);
    running.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      process.kill(-running.pid, "SIGTERM");
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
  preview = undefined;
}
async function startPreview(vars = configuration.vars) {
  await stopPreview();
  previewOutput = "";
  configuration.vars = vars;
  fs.writeFileSync(testConfig, JSON.stringify(configuration));
  preview = spawn(
    process.execPath,
    nodeRuntime
      ? [path.join(root, "dist/standalone/server.js")]
      : [
          cli,
          "dev",
          "--config",
          testConfig,
          "--local",
          "--persist-to",
          persistence,
          "--ip",
          "127.0.0.1",
          "--port",
          new URL(base).port,
          "--inspector-port",
          "0",
        ],
    {
      env: nodeRuntime
        ? {
            ...processEnv,
            KAVENEGAR_API_KEY: "",
            KAVENEGAR_TEMPLATE: "",
            ZARINPAL_MERCHANT_ID: "",
            TEMP_LOGIN_ENABLED: "false",
            SKIP_PAY_DEV: "false",
            ...vars,
            MEDIA_PATH: vars.MEDIA_PATH ?? mediaPath,
            DATABASE_PATH: path.join(folder, file),
            HOST: "127.0.0.1",
            PORT: new URL(base).port,
            APP_ORIGIN: base,
          }
        : processEnv,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  for (const stream of [preview.stdout, preview.stderr]) {
    stream.on("data", (chunk) => {
      previewOutput = (previewOutput + chunk.toString()).slice(-8000);
    });
  }
  for (let i = 0; i < 40; i++) {
    try {
      if ((await call("/api/me")).status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.fail("Local test Worker must become ready");
}
function event(name, capacity, price = 0) {
  const id = `${prefix}-${name}`;
  createdIds.push(id);
  db.prepare(
    "INSERT INTO events(id,host_id,title,description,category,venue,address,city,lat,lng,starts_at,ends_at,price,capacity,image,registration_ends_at,published,sample) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0)",
  ).run(
    id,
    identities[0],
    "رویداد آزمایشی تهران",
    "دادهٔ آزمون خودکار",
    "books",
    "کافه آزمون",
    "تهران، ونک",
    "تهران",
    35.75,
    51.4,
    now + 86400000,
    now + 90000000,
    price,
    capacity,
    "/images/books.jpg",
    now + 23 * 3600000,
  );
  return id;
}
try {
  const host = user(0),
    guest = user(1),
    other = user(2),
    admin = user(99);
  await startPreview();
  const health = await call("/api/health");
  check(
    health.status === 200 && health.data.status === "ok",
    "Anonymous health check reads the migrated database",
  );
  check(
    health.headers.get("cache-control") === "no-store",
    "Health responses cannot be cached",
  );
  if (nodeRuntime) {
    check(
      db.prepare("SELECT COUNT(*) n FROM events").get().n === 0,
      "Health checks do not seed sample events",
    );
    db.exec("ALTER TABLE events RENAME TO health_check_events");
    try {
      const unavailable = await call("/api/health");
      check(
        unavailable.status === 503,
        "Health check fails when the application table is unavailable",
      );
      check(
        JSON.stringify(unavailable.data) ===
          JSON.stringify({ status: "unavailable" }),
        "Unhealthy response exposes no database details",
      );
      check(
        unavailable.headers.get("cache-control") === "no-store",
        "Unhealthy responses cannot be cached",
      );
    } finally {
      db.exec("ALTER TABLE health_check_events RENAME TO events");
    }
    check(
      (await call("/api/health")).status === 200,
      "Health check recovers when database access returns",
    );
  }
  if (process.argv.includes("--docs")) {
    await testDocumentation({ base });
  } else if (process.argv.includes("--evenline")) {
    await testEvenline({ db, call, event, user, check, base, host, secret });
    await testPush({ db,user,check,base,secret });
    await testEmail({ db,user,check,base,secret });
    await testAvatar({ db,user,check,base });
    await testEventProgram({ db,call,event,user,check,base,host });
  } else if (process.argv.includes("--recommendations")) {
    await call("/api/events");
    await testRecommendations({ db, call, event, user, check, now, root });
  } else if (process.argv.includes("--location-links")) {
    await testLocationLinks({ call, base, host, check, createdIds, now });
  } else {
    check(
      (await call("/api/me", undefined, host.token)).data.user?.isHost,
      "Host access comes from configured phone allowlist",
    );
    check(
      (await call("/api/host", undefined, guest.token)).status === 403,
      "Normal users cannot read host attendee phone numbers",
    );
    await testCommunity({
      db,
      call,
      event,
      check,
      now,
      base,
      host,
      buyer: guest,
      stranger: other,
      admin,
    });
    await testAccountFeatures({
      db,
      call,
      event,
      user,
      check,
      now,
      root,
      host,
      guest,
      other,
      secret,
    });
    await testContent({ check, user, db, root, base, host, guest, admin });
    await testEvenline({ db, call, event, user, check, base, host, secret });
    await testPush({ db,user,check,base,secret });
    await testEmail({ db,user,check,base,secret });
    await testAvatar({ db,user,check,base });
    await testEventProgram({ db,call,event,user,check,base,host });
    check(
      (await call("/api/reservations")).status === 401,
      "Anonymous reservation reads are denied",
    );
    check(
      (await call("/api/auth/request", { phone: "invalid" })).status === 400,
      "Invalid Iranian phone number rejected",
    );
    check(
      (await call("/api/auth/request", { phone: "۰۹۱۲۱۲۳۴۵۶۷" })).status ===
        503,
      "Unconfigured SMS never fabricates a successful login",
    );
    const code = "472951",
      challenge = crypto.randomUUID();
    const otpPhone = "09999999888";
    challengeIds.push(challenge);
    db.prepare(
      "INSERT INTO challenges(id,phone,hash,expires_at) VALUES(?,?,?,?)",
    ).run(
      challenge,
      otpPhone,
      crypto
        .createHmac("sha256", secret)
        .update(`${challenge}:${otpPhone}:${code}`)
        .digest("hex"),
      now + 300000,
    );
    const verifications = await Promise.all([
      call("/api/auth/verify", { challengeId: challenge, code }),
      call("/api/auth/verify", { challengeId: challenge, code }),
    ]);
    check(
      verifications.filter((r) => r.status === 200).length === 1,
      "Concurrent OTP consumption permits exactly one login",
    );
    const verified = verifications.find((r) => r.status === 200);
    identities.push(verified.data.user.id);
    check(
      verified.cookie.includes("HttpOnly") &&
        verified.cookie.includes("SameSite=Lax"),
      "Session cookie is HttpOnly and SameSite=Lax",
    );
    check(
      (await call("/api/auth/verify", { challengeId: challenge, code }))
        .status === 400,
      "Consumed OTP cannot be replayed",
    );
    const badChallenge = crypto.randomUUID();
    challengeIds.push(badChallenge);
    db.prepare(
      "INSERT INTO challenges(id,phone,hash,expires_at) VALUES(?,?,?,?)",
    ).run(
      badChallenge,
      otpPhone,
      crypto
        .createHmac("sha256", secret)
        .update(`${badChallenge}:${otpPhone}:${code}`)
        .digest("hex"),
      now + 300000,
    );
    for (let i = 0; i < 5; i++)
      await call("/api/auth/verify", {
        challengeId: badChallenge,
        code: "111111",
      });
    check(
      (await call("/api/auth/verify", { challengeId: badChallenge, code }))
        .status === 400,
      "OTP locks after five wrong attempts",
    );
    const eventId = event("capacity", 7);
    const participants = Array.from({ length: 20 }, (_, i) => user(i + 10));
    const attempts = await Promise.all(
      participants.map((u) =>
        call(
          "/api/reservations",
          { eventId, quantity: 1, requestKey: crypto.randomUUID() },
          u.token,
        ),
      ),
    );
    check(
      attempts.filter((r) => r.status === 201).length === 7,
      "20 concurrent reservations sell exactly 7 seats for capacity 7",
    );
    check(
      attempts.filter((r) => r.status === 409).length === 13,
      "All 13 excess reservation attempts rejected",
    );
    check(
      db
        .prepare(
          "SELECT SUM(quantity) n FROM reservations WHERE event_id=? AND status='confirmed'",
        )
        .get(eventId).n === 7,
      "Database capacity remains exact",
    );
    const winner = attempts.findIndex((r) => r.status === 201);
    const reservation = attempts[winner].data.reservation;
    check(
      (
        await call(
          "/api/reservations/" + reservation.id,
          { action: "cancel" },
          other.token,
        )
      ).status === 404,
      "Another user cannot cancel a reservation",
    );
    check(
      (
        await call(
          "/api/reservations/" + reservation.id,
          { action: "cancel" },
          participants[winner].token,
        )
      ).status === 200,
      "Owner can cancel a future free reservation",
    );
    check(
      (
        await call(
          "/api/reservations",
          { eventId, quantity: 1, requestKey: crypto.randomUUID() },
          guest.token,
        )
      ).status === 201,
      "Cancellation releases capacity for the next reservation",
    );
    const unlimited = event("unlimited", null);
    const key = crypto.randomUUID();
    const duplicates = await Promise.all(
      Array.from({ length: 5 }, () =>
        call(
          "/api/reservations",
          { eventId: unlimited, quantity: 2, requestKey: key },
          guest.token,
        ),
      ),
    );
    check(
      duplicates.every((r) => [200, 201].includes(r.status)),
      "Identical retry requests return the existing result",
    );
    check(
      db
        .prepare(
          "SELECT COUNT(*) n FROM reservations WHERE user_id=? AND request_key=?",
        )
        .get(guest.id, key).n === 1,
      "Five simultaneous clicks create one booking",
    );
    const conflictKey = crypto.randomUUID();
    const conflicts = await Promise.all(
      [1, 2].map((quantity) =>
        call(
          "/api/reservations",
          { eventId: unlimited, quantity, requestKey: conflictKey },
          other.token,
        ),
      ),
    );
    check(
      conflicts.some((r) => r.status === 409) &&
        conflicts.some((r) => r.status === 201),
      "Concurrent idempotency key reuse with different payload is rejected",
    );
    check(
      (
        await call(
          "/api/reservations",
          { eventId: unlimited, quantity: 7, requestKey: crypto.randomUUID() },
          guest.token,
        )
      ).status === 400,
      "Ticket quantity outside limit rejected",
    );
    check(
      (
        await call(
          "/api/reservations",
          { eventId: unlimited, quantity: 1, requestKey: crypto.randomUUID() },
          guest.token,
          "https://attacker.invalid",
        )
      ).status === 403,
      "Cross-origin mutation rejected",
    );
    const paid = event("paid", 3, 250000);
    check(
      (
        await call(
          "/api/reservations",
          { eventId: paid, quantity: 1, requestKey: crypto.randomUUID() },
          guest.token,
        )
      ).status === 503,
      "Paid checkout fails closed without provider configuration",
    );
    check(
      db
        .prepare("SELECT COUNT(*) n FROM reservations WHERE event_id=?")
        .get(paid).n === 0,
      "Unconfigured payments do not consume capacity",
    );
    const dateParts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now + 86400000);
    const dateInput = ["year", "month", "day"]
      .map((t) => dateParts.find((p) => p.type === t).value)
      .join("/");
    const eventForm = {
      title: "کارگاه آزمایش خودکار",
      description: "این رویداد فقط برای اعتبارسنجی ساخته می‌شود.",
      venue: "کافه آزمایش",
      address: "تهران، ونک",
      city: "تهران",
      maps_url: "https://www.google.com/maps/search/?api=1&query=35.75%2C51.4",
      date: dateInput,
      time: "18:00",
      endTime: "20:00",
      registrationDate: dateInput,
      registrationTime: "17:00",
      price: "0",
      capacity: "12",
      category: "art",
    };
    const created = await call("/api/host", eventForm, host.token);
    check(
      created.status === 201,
      "Host creates a real stored event using a Persian calendar date",
    );
    createdIds.push(created.data.id);
    check(
      db
        .prepare("SELECT created_at FROM events WHERE id=?")
        .get(created.data.id).created_at >= now,
      "New host events record their actual creation timestamp",
    );
    check(
      (await call("/api/events/" + created.data.id)).data.event.title ===
        eventForm.title,
      "Created host event is visible in public discovery",
    );
    check(
      (
        await call(
          "/api/host",
          { action: "publish", id: created.data.id, published: false },
          host.token,
        )
      ).status === 200,
      "Host can pause event sales",
    );
    check(
      (await call("/api/events/" + created.data.id)).status === 404,
      "Unpublished event is hidden from public detail",
    );
    check(
      (
        await call(
          "/api/host",
          { action: "publish", id: "books", published: false },
          host.token,
        )
      ).status === 404,
      "Host cannot change another host’s event",
    );
    check(
      (
        await call(
          "/api/host",
          { ...eventForm, date: "1404/12/30" },
          host.token,
        )
      ).status === 400,
      "Invalid Persian calendar date is rejected",
    );
    await testRegistration({
      db,
      call,
      event,
      host,
      guest,
      eventForm,
      check,
      createdIds,
    });
    await testLocationLinks({ call, base, host, check, createdIds, now });
    await testEventCreation({
      db,
      call,
      base,
      host,
      guest,
      eventForm,
      check,
      createdIds,
      startPreview,
      vars: { ...configuration.vars },
      nodeRuntime,
      mediaPath,
    });
    const largeOrder = event("large-order", 20, 60000000);
    check(
      (
        await call(
          "/api/reservations",
          { eventId: largeOrder, quantity: 2, requestKey: crypto.randomUUID() },
          guest.token,
        )
      ).status === 400,
      "Order total above gateway limit is rejected before allocating seats",
    );
    for (let i = 0; i < 55; i++)
      db.prepare(
        "INSERT INTO reservations(id,user_id,event_id,quantity,total,amount_rial,status,request_key,created_at,payment_state) VALUES(?,?,?,1,0,0,'confirmed',?,?,'none')",
      ).run(
        `${prefix}-page-${i}`,
        guest.id,
        unlimited,
        crypto.randomUUID(),
        now + i,
      );
    const firstPage = (await call("/api/host?page=0", undefined, host.token))
      .data;
    const secondPage = (await call("/api/host?page=1", undefined, host.token))
      .data;
    check(
      firstPage.attendees.length === 50 && secondPage.attendees.length > 0,
      "Host attendee pagination exposes more than 50 reservations",
    );
    check(
      !secondPage.attendees.some((r) =>
        firstPage.attendees.some((a) => a.id === r.id),
      ),
      "Attendee pages do not repeat rows",
    );
    check(
      firstPage.stats.bookings === firstPage.attendeeTotal,
      "Host summary counts all reservations rather than only the current page",
    );
    const hostRows = (await call("/api/host", undefined, host.token)).data;
    check(
      hostRows.attendees.some((r) => r.phone === guest.phone),
      "Authorized host sees attendee phone numbers",
    );
    check(
      hostRows.events.every((e) => e.host_id === host.id),
      "Host dashboard contains only owned events",
    );
    const guestRows = (await call("/api/reservations", undefined, guest.token))
      .data.reservations;
    check(
      guestRows.length > 0 &&
        guestRows.every((reservation) => {
          const location = db
            .prepare("SELECT maps_url,lat,lng FROM events WHERE id=?")
            .get(reservation.event_id);
          return ["maps_url", "lat", "lng"].every(
            (key) => reservation[key] === location[key],
          );
        }),
      "Reservation history returns the event's stored venue link and nullable coordinates",
    );
    check(
      guestRows.every(
        (r) =>
          db.prepare("SELECT user_id FROM reservations WHERE id=?").get(r.id)
            .user_id === guest.id,
      ),
      "Reservation list contains only the current user’s bookings",
    );
    const sqlSource = fs.readFileSync("lib/booking-sql.ts", "utf8");
    const compiled = ts.transpile(sqlSource, {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    });
    const { reserveSql, confirmSql } = await import(
      "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
    );
    const late = event("late", 1, 50000);
    const old = `${prefix}-late`,
      next = `${prefix}-next`;
    db.prepare(reserveSql).get(
      old,
      guest.id,
      late,
      1,
      crypto.randomUUID(),
      now - 20000,
      now - 10000,
      "آزمایش پرداخت",
      0,
    );
    check(
      !!db
        .prepare(reserveSql)
        .get(
          next,
          other.id,
          late,
          1,
          crypto.randomUUID(),
          now,
          now + 900000,
          "آزمایش پرداخت",
          0,
        ),
      "Expired payment hold releases capacity without cleanup",
    );
    check(
      !db.prepare(confirmSql).get(old, "late-reference", now),
      "Late paid confirmation cannot exceed occupied capacity",
    );
    db.prepare("UPDATE reservations SET status='failed' WHERE id=?").run(next);
    check(
      !!db.prepare(confirmSql).get(old, "late-reference", now),
      "Late successful payment reacquires available capacity",
    );
    check(
      !db.prepare(confirmSql).get(old, "late-reference", now),
      "Repeated payment confirmation does not allocate seats twice",
    );
    const recover = event("recover", 1, 50000),
      recoverId = `${prefix}-recover`;
    db.prepare(reserveSql).get(
      recoverId,
      guest.id,
      recover,
      1,
      crypto.randomUUID(),
      now,
      now + 900000,
      "آزمایش پرداخت",
      0,
    );
    db.prepare("UPDATE reservations SET status='failed' WHERE id=?").run(
      recoverId,
    );
    check(
      !!db.prepare(confirmSql).get(recoverId, "recovered-reference", now),
      "A later successful payment can recover a previously failed attempt",
    );
    await testTicketing({
      db,
      call,
      event,
      check,
      host,
      guest,
      other,
      base,
      unlimited,
      now,
    });
    const suggestionSample = await testRecommendations({
      db,
      call,
      event,
      user,
      check,
      now,
      root,
    });
    const suggestionVars = { ...configuration.vars };
    await startPreview({ ...suggestionVars, SEED_SAMPLE_EVENTS: "false" });
    const hiddenSamples = (await call("/api/events")).data;
    check(
      hiddenSamples.events.every((event) => event.sample === 0) &&
        !hiddenSamples.suggestions.some(
          (item) => item.eventId === suggestionSample,
        ),
      "Disabling sample events excludes them from both catalog and suggestions",
    );
    const withoutSamplesFlag = { ...suggestionVars };
    delete withoutSamplesFlag.SEED_SAMPLE_EVENTS;
    await startPreview(withoutSamplesFlag);
    check((await call("/api/events")).data.events.every(event => event.sample === 0),
      "Sample events are hidden unless explicitly enabled");
    check((await call(`/api/events/${suggestionSample}`)).status === 404,
      "Sample event details are unavailable without explicit opt-in");
    await startPreview(suggestionVars);
    await testPaymentBypass({
      db,
      call,
      event,
      user,
      check,
      host,
      startPreview,
      normalVars: suggestionVars,
    });
    check(
      (await call("/api/auth/logout", {}, guest.token)).status === 200,
      "Logout succeeds",
    );
    check(
      (await call("/api/me", undefined, guest.token)).data.user === null,
      "Logged-out token is invalidated server-side",
    );
    // TODO(PRODUCTION): REMOVE_TEMP_LOGIN — remove this temporary login coverage with the feature.
    const normalVars = { ...configuration.vars };
    const temporaryPhones = ["09108624707", "09108624708"];
    async function checkTemporaryLoginDisabled(label) {
      check(
        (await call("/api/me")).data.temporaryLoginEnabled === false,
        `${label} reports temporary login disabled`,
      );
      for (const phone of temporaryPhones) {
        const response = await call("/api/auth/request", { phone });
        check(
          response.status === 503 && !response.cookie && !response.data.user,
          `${label} does not bypass SMS for ${phone}`,
        );
      }
    }
    await checkTemporaryLoginDisabled("Missing configuration");
    check(
      temporaryPhones.every(
        (phone) => !db.prepare("SELECT id FROM users WHERE phone=?").get(phone),
      ),
      "Disabled temporary login creates no accounts",
    );
    const temporaryVars = {
      HOST_PHONES: `${hostPhone},${temporaryPhones[0]}`,
      SEED_SAMPLE_EVENTS: "true",
      TEMP_LOGIN_ENABLED: "true",
    };
    await startPreview(temporaryVars);
    const temporaryStatus = (await call("/api/me")).data;
    check(
      temporaryStatus.temporaryLoginEnabled === true &&
        temporaryStatus.smsReady === false &&
        temporaryStatus.user === null,
      "Temporary mode is reported without SMS credentials",
    );
    check((await call("/api/auth/request", { phone: temporaryPhones[0] })).status === 503,
      "Test OTP requires a configured secret even without SMS delivery");
    temporaryVars.OTP_SECRET = secret;
    await startPreview(temporaryVars);
    // Reset only the isolated test phone's request limits between independent scenarios.
    function resetTestPhoneLimit() {
      db.prepare("DELETE FROM rate_limits WHERE key=? OR key LIKE 'otp-ip:%'").run("otp-phone:" + temporaryPhones[0]);
    }
    async function requestTestChallenge(phone = temporaryPhones[0]) {
      resetTestPhoneLimit();
      const response = await call("/api/auth/request", { phone });
      check(response.status === 200 && response.data.challengeId && !response.cookie && !response.data.user,
        "Test OTP request returns a challenge without authenticating");
      return response.data.challengeId;
    }
    async function temporaryLogin(data) {
      resetTestPhoneLimit();
      const response = await call("/api/auth/request", data);
      if (!response.data.challengeId) return response;
      check(!response.cookie && !response.data.user, "Test login still requires code verification");
      return call("/api/auth/verify", { challengeId: response.data.challengeId, code: "123456", name: data.name });
    }
    const testChallenge = await requestTestChallenge();
    check(!db.prepare("SELECT id FROM users WHERE phone=?").get(temporaryPhones[0]),
      "Requesting a test OTP does not create an account");
    const storedChallenge = db.prepare("SELECT * FROM challenges WHERE id=?").get(testChallenge);
    check(storedChallenge.hash === "test:" + crypto.createHmac("sha256", secret)
      .update(`${testChallenge}:${temporaryPhones[0]}:123456`).digest("hex") &&
      storedChallenge.expires_at > Date.now() + 290000,
      "Test challenge stores only a marked HMAC with five-minute expiry");
    check((await call("/api/auth/request", { phone: temporaryPhones[0] })).status === 200,
      "Fixed test code can be requested again immediately");
    for (let attempt = 0; attempt < 5; attempt++) {
      const rejected = await call("/api/auth/verify", { challengeId: testChallenge, code: "999999" });
      check(rejected.status === 400 && !rejected.cookie, "Wrong test code never authenticates");
    }
    check((await call("/api/auth/verify", { challengeId: testChallenge, code: "123456" })).status === 200,
      "Fixed test code still signs in after five wrong attempts");
    const expiredChallenge = await requestTestChallenge();
    db.prepare("UPDATE challenges SET expires_at=? WHERE id=?").run(Date.now() - 1, expiredChallenge);
    check((await call("/api/auth/verify", { challengeId: expiredChallenge, code: "123456" })).status === 200,
      "Fixed test code still signs in after challenge expiry");
    const supersededChallenge = await requestTestChallenge();
    // Simulate passage of the resend cooldown without sleeping.
    db.prepare("UPDATE rate_limits SET last_at=? WHERE key=?").run(Date.now() - 61000, "otp-phone:" + temporaryPhones[0]);
    const replacement = await call("/api/auth/request", { phone: temporaryPhones[0] });
    check(replacement.status === 200 &&
      (await call("/api/auth/verify", { challengeId: supersededChallenge, code: "123456" })).status === 200,
      "Resending does not invalidate the fixed test code on an earlier challenge");
    const disabledChallenge = await requestTestChallenge();
    await startPreview({ ...temporaryVars, TEMP_LOGIN_ENABLED: "false" });
    const disabledVerify = await call("/api/auth/verify", { challengeId: disabledChallenge, code: "123456" });
    check(disabledVerify.status === 400 && !disabledVerify.cookie,
      "Disabling demo mode rejects outstanding test challenges");
    await startPreview(temporaryVars);
    resetTestPhoneLimit();
    const loginStarted = Date.now();
    const verifiedChallenge = await requestTestChallenge();
    const temporaryUser = await call("/api/auth/verify", {
      challengeId: verifiedChallenge,
      code: "۱۲۳۴۵۶",
      phone: temporaryPhones[0],
      isHost: true,
    });
    check((await call("/api/auth/verify", { challengeId: verifiedChallenge, code: "123456" })).status === 200,
      "The fixed test code can be reused while temporary login is enabled");
    const temporaryHost = await call("/api/auth/request", {
      phone: temporaryPhones[1],
      isHost: false,
    });
    function temporarySession(response) {
      assert.equal(response.status, 200);
      assert.match(response.cookie ?? "", /hg_session=[a-f0-9]{64}/);
      identities.push(response.data.user.id);
      return response.cookie.match(/hg_session=([a-f0-9]{64})/)[1];
    }
    const temporaryUserToken = temporarySession(temporaryUser);
    const temporaryHostToken = temporarySession(temporaryHost);
    check(
      temporaryUser.data.user.phone === temporaryPhones[0] &&
        temporaryUser.data.user.name === "کاربر آزمایشی" &&
        temporaryUser.data.user.isHost === false &&
        !temporaryUser.data.challengeId,
      "Temporary user receives a real regular account despite allowlist and client role values",
    );
    check(
      temporaryHost.data.user.phone === temporaryPhones[1] &&
        temporaryHost.data.user.name === "میزبان آزمایشی" &&
        temporaryHost.data.user.isHost === true &&
        !temporaryHost.data.challengeId,
      "Temporary host receives a real host account without the host allowlist",
    );
    for (const [response, token] of [
      [temporaryUser, temporaryUserToken],
      [temporaryHost, temporaryHostToken],
    ]) {
      const session = db
        .prepare("SELECT user_id,expires_at FROM sessions WHERE hash=?")
        .get(digest(token));
      check(
        response.cookie.includes("HttpOnly") &&
          response.cookie.includes("SameSite=Lax") &&
          response.cookie.includes("Path=/") &&
          response.cookie.includes("Max-Age=2592000") &&
          session?.user_id === response.data.user.id &&
          session.expires_at >= loginStarted + 30 * 86400000 &&
          session.expires_at <= Date.now() + 30 * 86400000,
        `${response.data.user.phone} receives a stored hashed session and a 30-day HttpOnly cookie`,
      );
      check(
        (await call("/api/me", undefined, token)).data.user.id ===
          response.data.user.id,
        `${response.data.user.phone} stays authenticated on subsequent requests`,
      );
    }
    check(
      (await call("/api/me", undefined, host.token)).data.user?.isHost === true,
      "Temporary role mappings preserve host allowlist behavior for other accounts",
    );
    check(
      (await call("/api/host", undefined, temporaryUserToken)).status === 403 &&
        (await call("/api/host", eventForm, temporaryUserToken)).status === 403,
      "Temporary regular user cannot read host data or create host events",
    );
    check(
      (await call("/api/reservations", undefined, temporaryUserToken))
        .status === 200,
      "Temporary regular user can access reservations",
    );
    const temporaryEvent = await call(
      "/api/host",
      eventForm,
      temporaryHostToken,
    );
    check(
      temporaryEvent.status === 201,
      "Temporary host can create a real event without SMS credentials",
    );
    createdIds.push(temporaryEvent.data.id);
    check(
      db
        .prepare("SELECT host_id FROM events WHERE id=?")
        .get(temporaryEvent.data.id).host_id === temporaryHost.data.user.id,
      "Temporary host event is stored under the authenticated host identity",
    );
    check(
      (
        await call(
          "/api/host",
          { action: "publish", id: created.data.id, published: true },
          temporaryHostToken,
        )
      ).status === 404,
      "Temporary host cannot modify another host’s event",
    );
    const normalizedPhones = [
      ["۰۹۱۰۸۶۲۴۷۰۷", temporaryUser],
      ["+98 910-862-4707", temporaryUser],
      ["00989108624707", temporaryUser],
      ["۰۹۱۰۸۶۲۴۷۰۸", temporaryHost],
      ["+98 910-862-4708", temporaryHost],
      ["00989108624708", temporaryHost],
    ];
    for (const [phone, original] of normalizedPhones) {
      const repeated = await temporaryLogin({
        phone,
        name: "نام جایگزین",
      });
      check(
        repeated.status === 200 &&
          repeated.data.user.id === original.data.user.id &&
          repeated.data.user.phone === original.data.user.phone &&
          repeated.data.user.name === original.data.user.name &&
          repeated.data.user.isHost === original.data.user.isHost,
        `${phone} normalizes to the existing account and preserves its name and role`,
      );
    }
    check(
      temporaryPhones.every(
        (phone) =>
          db.prepare("SELECT COUNT(*) n FROM users WHERE phone=?").get(phone)
            .n === 1,
      ),
      "Repeated temporary logins never duplicate accounts",
    );
    db.prepare("UPDATE users SET name='' WHERE phone=?").run(
      temporaryPhones[0],
    );
    const suppliedName = "  " + "آ".repeat(90) + "  ";
    check(
      (
        await temporaryLogin({
          phone: temporaryPhones[0],
          name: suppliedName,
        })
      ).data.user.name === "آ".repeat(80),
      "Blank temporary account names use the trimmed supplied name limited to 80 characters",
    );
    db.prepare("UPDATE users SET name='' WHERE phone=?").run(
      temporaryPhones[1],
    );
    check(
      (
        await call("/api/auth/request", {
          phone: temporaryPhones[1],
          name: "   ",
        })
      ).data.user.name === "میزبان آزمایشی",
      "Blank supplied temporary names fall back to the Persian account label",
    );
    const storedSessions = () =>
      db.prepare("SELECT COUNT(*) n FROM sessions").get().n;
    const sessionsBeforeInvalid = storedSessions();
    const challengeCount = db.prepare("SELECT COUNT(*) n FROM challenges").get().n;
    check(
      (
        await call(
          "/api/auth/request",
          { phone: temporaryPhones[1] },
          undefined,
          "https://attacker.invalid",
        )
      ).status === 403,
      "Temporary login rejects cross-origin requests",
    );
    check(
      (await call("/api/auth/request", { phone: "invalid" })).status === 400 &&
        (await call("/api/auth/request", { phone: 9108624708 })).status === 400,
      "Temporary login still rejects invalid and non-string phone numbers",
    );
    const unrelatedLogin = await call("/api/auth/request", {
      phone: "09121234567",
    });
    check(
      unrelatedLogin.status === 503 && !unrelatedLogin.cookie,
      "An unrelated phone still requires configured SMS when temporary login is enabled",
    );
    check(
      storedSessions() === sessionsBeforeInvalid &&
        db.prepare("SELECT COUNT(*) n FROM challenges").get().n ===
          challengeCount,
      "Rejected requests create neither OTP challenges nor sessions",
    );
    await startPreview(temporaryVars);
    check(
      (await call("/api/me", undefined, temporaryHostToken)).data.user
        ?.isHost === true &&
        (await call("/api/me", undefined, temporaryUserToken)).data.user?.id ===
          temporaryUser.data.user.id,
      "Both temporary sessions persist across Worker restarts",
    );
    check(
      (await call("/api/auth/logout", {}, temporaryUserToken)).status === 200 &&
        (await call("/api/me", undefined, temporaryUserToken)).data.user ===
          null,
      "Temporary login logout revokes its stored session",
    );
    const userRelogin = await temporaryLogin({
      phone: temporaryPhones[0],
    });
    const userReloginToken = userRelogin.cookie?.match(
      /hg_session=([a-f0-9]{64})/,
    )?.[1];
    check(
      userRelogin.status === 200 &&
        !!userReloginToken &&
        userRelogin.data.user.id === temporaryUser.data.user.id,
      "Temporary login can reuse its account immediately after logout",
    );
    db.prepare(
      "UPDATE rate_limits SET count=19,resets_at=?,last_at=? WHERE key LIKE 'temp-login-ip:%'",
    ).run(Date.now() + 3600000, Date.now() - 1);
    check(
      (await call("/api/auth/request", { phone: temporaryPhones[1] }))
        .status === 200,
      "Temporary host IP rate limit permits its twentieth hourly login without a cooldown",
    );
    const sessionsBeforeIpLimit = storedSessions();
    check(
      (await call("/api/auth/request", { phone: temporaryPhones[1] }))
        .status === 429 && storedSessions() === sessionsBeforeIpLimit,
      "Temporary host IP rate limit blocks the next login without creating a session",
    );
    db.prepare(
      "UPDATE rate_limits SET resets_at=? WHERE key LIKE 'temp-login-ip:%'",
    ).run(Date.now() - 1);
    check(
      (await call("/api/auth/request", { phone: temporaryPhones[1] }))
        .status === 200,
      "Temporary IP rate limit resets after its hour expires",
    );
    db.prepare(
      "DELETE FROM rate_limits WHERE key LIKE 'temp-login-ip:%'",
    ).run();
    resetTestPhoneLimit();
    db.prepare("INSERT INTO rate_limits(key,count,resets_at,last_at) VALUES(?,?,?,?)")
      .run("otp-phone:" + temporaryPhones[0], 5, Date.now() + 3600000, Date.now());
    for (const address of ["local", "127.0.0.1"]) {
      db.prepare("INSERT INTO rate_limits(key,count,resets_at,last_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,resets_at=excluded.resets_at,last_at=excluded.last_at")
        .run("otp-ip:" + digest(address), 20, Date.now() + 3600000, Date.now());
    }
    const unblockedTestCode = await call("/api/auth/request", { phone: "+989108624707" });
    check(unblockedTestCode.status === 200 && unblockedTestCode.data.resendAfter === 0,
      "Fixed test account is not blocked by stale production request limits");
    check((await call("/api/auth/verify", { challengeId: unblockedTestCode.data.challengeId, code: "123456" })).status === 200,
      "Fixed test code authenticates despite exhausted request limits");
    await startPreview({ ...normalVars, TEMP_LOGIN_ENABLED: "false" });
    await checkTemporaryLoginDisabled("False configuration");
    check(
      (await call("/api/me", undefined, temporaryHostToken)).data.user
        ?.isHost === false &&
        (await call("/api/me", undefined, userReloginToken)).data.user
          ?.isHost === false &&
        (await call("/api/host", undefined, temporaryHostToken)).status === 403,
      "Disabling temporary login immediately removes temporary host access while sessions remain authenticated",
    );
    db.exec(
      fs.readFileSync(
        path.join(root, "scripts/remove-temp-login-sessions.sql"),
        "utf8",
      ),
    );
    check(
      (await call("/api/me", undefined, temporaryHostToken)).data.user ===
        null &&
        (await call("/api/me", undefined, userReloginToken)).data.user ===
          null &&
        temporaryPhones.every(
          (phone) =>
            db
              .prepare(
                "SELECT COUNT(*) n FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.phone=?",
              )
              .get(phone).n === 0,
        ),
      "Production cleanup SQL revokes every session for both temporary accounts",
    );
    check(
      (await call("/api/me", undefined, host.token)).data.user?.id ===
        host.id &&
        temporaryPhones.every((phone) =>
          db.prepare("SELECT id FROM users WHERE phone=?").get(phone),
        ) &&
        !!db
          .prepare("SELECT id FROM events WHERE id=?")
          .get(temporaryEvent.data.id),
      "Production cleanup preserves unrelated sessions, account records, and created events",
    );
    await startPreview({ ...normalVars, TEMP_LOGIN_ENABLED: "TRUE" });
    await checkTemporaryLoginDisabled("Non-exact true configuration");
    // End TODO(PRODUCTION): REMOVE_TEMP_LOGIN coverage.
  }
  console.log(
    `\n${checks} checks passed. No external SMS or payment was sent.`,
  );
} catch (error) {
  console.error(previewOutput);
  throw error;
} finally {
  await stopPreview();
  db.exec("BEGIN");
  try {
    for (const id of createdIds)
      db.prepare("DELETE FROM reservations WHERE event_id=?").run(id);
    for (const id of createdIds)
      db.prepare("DELETE FROM events WHERE id=?").run(id);
    for (const id of identities) {
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
      db.prepare("DELETE FROM users WHERE id=?").run(id);
    }
    for (const id of challengeIds)
      db.prepare("DELETE FROM challenges WHERE id=?").run(id);
    db.prepare("DELETE FROM rate_limits WHERE key LIKE ? OR key LIKE ?").run(
      "%" + prefix + "%",
      "%0999999%",
    );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    db.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
