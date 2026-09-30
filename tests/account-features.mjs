import { withLocaleModules } from "./locale-module.mjs";
import fs from "node:fs";
import crypto from "node:crypto";
import ts from "typescript";

function moduleUrl(file, imports = {}) {
  let source = fs.readFileSync(file, "utf8");
  for (const [specifier, url] of Object.entries(imports)) source = source.replace(`"${specifier}"`, JSON.stringify(url));
  const compiled = ts.transpileModule(withLocaleModules(source), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
}

export async function testAccountFeatures({ check, call, db, event, now, guest, other, secret }) {
  const { reservationAmountLabel, reservationStatusLabel, confirmedReservationSql, outstandingReservationSql } = await import(moduleUrl("lib/account-types.ts"));
  check(confirmedReservationSql("r.") === "r.status='confirmed'" && outstandingReservationSql("r.") === "((r.status='hold' AND r.expires_at>?) OR r.status='paid_unfulfilled')",
    "Account purchase and outstanding SQL conditions use shared status helpers");
  check(reservationAmountLabel("confirmed", "paid", 15000) === "۱۵٬۰۰۰ تومان · پرداخت‌شده",
    "Account labels a confirmed charge as paid");
  check(reservationAmountLabel("confirmed", "skipped_dev", 15000) === "وجهی دریافت نشده",
    "A skipped development payment is never described as paid");
  check(reservationAmountLabel("hold", "pending", 15000).includes("قابل پرداخت"),
    "An unpaid hold is described as an amount due");
  check(reservationStatusLabel("paid_unfulfilled", "paid", 15000, now, now) === "پرداخت انجام شده؛ رزرو نیازمند پیگیری",
    "Paid but unfulfilled reservations remain distinguishable");
  check(reservationStatusLabel("hold", "verification_pending", 15000, now + 1000, now) === "تأیید پرداخت در حال بررسی" && reservationStatusLabel("hold", "not_verified", 15000, now + 1000, now) === "پرداخت تأیید نشد",
    "Payment verification states remain distinct from an unpaid hold");
  await testServerClock(check);

  const eventId = event("account-receipt", 3, 0);
  const booking = await call("/api/reservations", {
    eventId,
    quantity: 1,
    requestKey: `account-${crypto.randomUUID()}`,
  }, guest.token);
  check(booking.status === 201 && booking.data.reservation?.status === "confirmed",
    "A confirmed reservation can be used to issue an account receipt");
  const reservationId = booking.data.reservation.id;
  const receipt = await call(`/api/reservations/${reservationId}/receipt`, undefined, guest.token);
  check(receipt.status === 200 && receipt.data.receipt?.id === reservationId && receipt.data.receipt?.total === 0,
    "Receipt JSON includes the owner's booking snapshot and zero amount");
  check(typeof receipt.data.serverNow === "number" && receipt.data.receipt?.created_at === booking.data.reservation.created_at,
    "Receipt uses the reservation creation time and a server clock");
  const privateReceipt = await call(`/api/reservations/${reservationId}/receipt`, undefined, other.token);
  check(privateReceipt.status === 404, "Another account cannot read a reservation receipt");

  const base = process.env.TEST_ORIGIN ?? "http://127.0.0.1:5188";
  async function patch(route, data, token) {
    const response = await fetch(base + route, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: base, Cookie: `hg_session=${token}` },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(5000),
    });
    let body;
    try { body = await response.json(); } catch { body = {}; }
    return { status: response.status, data: body };
  }
  const oldPhone = guest.phone;
  const updatedName = `حساب تازه ${crypto.randomUUID().slice(0, 5)}`;
  const updated = await patch("/api/me", { name: updatedName }, guest.token);
  const current = await call("/api/me", undefined, guest.token);
  check(updated.status === 200 && current.data.user?.name === updatedName && current.data.user?.phone === oldPhone,
    "Profile updates change the name while preserving the verified phone");
  const snapshottedReceipt = await call(`/api/reservations/${reservationId}/receipt`, undefined, guest.token);
  check(snapshottedReceipt.data.receipt?.name === receipt.data.receipt?.name && snapshottedReceipt.data.receipt?.phone === oldPhone,
    "Profile edits do not rewrite the purchaser details saved with an older reservation");
  check((await patch("/api/me", { name: "ک" }, guest.token)).status === 400,
    "Profile names shorter than two characters are rejected");
  check((await patch("/api/me", { name: "ا".repeat(81) }, guest.token)).status === 400,
    "Profile names longer than 80 characters are rejected");

  const page = await call("/api/reservations?page=1&pageSize=10", undefined, guest.token);
  check(page.status === 200 && page.data.items?.some((item) => item.id === reservationId) && page.data.total >= 1 && page.data.pageSize === 10,
    "Reservation history returns owner-only numbered pages of ten");
  const legacy = await call("/api/reservations", undefined, guest.token);
  check(Array.isArray(legacy.data.reservations), "Legacy reservation reads keep their original response shape");
  const summary = await call("/api/account/summary", undefined, guest.token);
  check(summary.data.latestPurchase?.id === reservationId && summary.data.confirmedCount >= 1,
    "Account summary selects the latest confirmed purchase");

  // Verify directly seeded challenges so the test never contacts Kavenegar.
  const phone = guest.phone;
  const code = "483921";
  const challengeNow = Date.now();
  const firstId = `account-otp-old-${crypto.randomUUID()}`;
  const validId = `account-otp-valid-${crypto.randomUUID()}`;
  const challengeHash = (id) => crypto.createHmac("sha256", secret)
    .update(`${id}:${phone}:${code}`).digest("hex");
  db.prepare("INSERT INTO challenges(id,phone,hash,expires_at) VALUES(?,?,?,?)")
    .run(firstId, phone, challengeHash(firstId), challengeNow + 300000);
  db.prepare("INSERT INTO challenges(id,phone,hash,expires_at) VALUES(?,?,?,?)")
    .run(validId, phone, challengeHash(validId), challengeNow + 300000);
  try {
    const verified = await call("/api/auth/verify", { challengeId: validId, code }, undefined);
    const oldChallenge = db.prepare("SELECT consumed FROM challenges WHERE id=?").get(firstId);
    const validChallenge = db.prepare("SELECT consumed FROM challenges WHERE id=?").get(validId);
    check(verified.status === 200 && validChallenge?.consumed === 1 && oldChallenge?.consumed === 1,
      "Successful OTP verification consumes other unexpired challenges for that phone");
  } finally {
    db.prepare("DELETE FROM challenges WHERE id IN (?,?)").run(firstId, validId);
  }
  await testOtpRequestContract(check);
}

export async function testServerClock(check) {
  const { serverClockAnchor, serverClockTime } = await import(moduleUrl("lib/server-clock.ts"));
  const serverNow = 1_800_000_000_000;
  const firstObservation = serverClockAnchor(serverNow, 45_000);
  const remountedObservation = serverClockAnchor(serverNow, 99_000);
  check(firstObservation === 45_000 && remountedObservation === firstObservation,
    "Server time keeps its original client anchor when countdown consumers remount");
  check(serverClockTime(serverNow, remountedObservation, 47_500) === serverNow + 2500,
    "Countdowns advance from server time even when the device clock is skewed");
}

export async function testOtpRequestContract(check) {
  const dbModule = `
    const challenges = new Map();
    export const config = () => ({ KAVENEGAR_API_KEY: "stub-secret-key", KAVENEGAR_TEMPLATE: "stub-template", APP_ORIGIN: "http://127.0.0.1:5174" });
    export const challengeRows = challenges;
    export const database = () => ({
      prepare(sql) {
        let values = [];
        return {
          bind(...args) { values = args; return this; },
          async run() {
            if (sql.startsWith("INSERT INTO challenges")) {
              const [id, phone, hash, expiresAt] = values;
              challenges.set(id, { id, phone, hash, expires_at: expiresAt, consumed: 0 });
              return { success: true };
            }
            if (sql.startsWith("UPDATE challenges SET consumed=1")) {
              const [phone, exceptId] = values;
              for (const row of challenges.values()) if (row.phone === phone && row.id !== exceptId && !row.consumed) row.consumed = 1;
              return { success: true };
            }
            if (sql.startsWith("DELETE FROM challenges")) { challenges.delete(values[0]); return { success: true }; }
            throw new Error("Unexpected mock SQL");
          },
        };
      },
    });
  `;
  const serverModule = `
    export class ApiError extends Error { constructor(status,message){super(message);this.status=status;} }
    export const boundary = async (work) => { try { return await work(); } catch (error) { return error instanceof ApiError ? json({error:error.message},error.status) : json({error:"unexpected"},503); } };
    export const body = async (request) => request.json();
    export const json = (value,status=200) => Response.json(value,{status});
    export const otpHash = async (id,phone,code) => ` + "`stored:${id}:${phone}:${code}`" + `;
    export const phoneNumber = (value) => { if (!/^09\\d{9}$/.test(value)) throw new ApiError(400,"bad phone"); return value; };
    export const rateLimit = async () => {};
    export const sameOrigin = (request) => { if (request.headers.get("origin") !== new URL(request.url).origin) throw new ApiError(403,"bad origin"); };
    export const smsReady = () => true;
    export const hash = async (value) => value;
    export const createSession = async () => json({user:{id:"test"}});
  `;
  const temporaryModule = `export const temporaryAccount = () => null;`;
  const asDataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { POST } = await import(moduleUrl("app/api/auth/request/route.ts", {
    "@/db": asDataUrl(dbModule),
    "@/lib/temporary-login": asDataUrl(temporaryModule),
    "@/lib/server": asDataUrl(serverModule),
  }));
  const db = await import(asDataUrl(dbModule));
  const dbRows = db.challengeRows;
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const originalError = console.error;
  const originalLog = console.log;
  const logOutput = [];
  let delivery = "success";
  let observedToken = "";
  const fixedNow = 1_800_000_000_000;
  let timeRead = 0;
  Date.now = () => { timeRead++; return fixedNow + (timeRead === 1 ? 0 : 12345); };
  globalThis.fetch = async (url, init) => {
    const params = new URLSearchParams(init.body);
    observedToken = params.get("token") ?? "";
    return {
      ok: delivery === "success",
      async json() { return { return: { status: delivery === "success" ? 200 : 500 } }; },
    };
  };
  console.error = (...values) => logOutput.push(values.join(" "));
  console.log = (...values) => logOutput.push(values.join(" "));
  const phone = "09123456789";
  const previousId = "previous-live-challenge";
  dbRows.set(previousId, { id: previousId, phone, hash: "old", expires_at: fixedNow + 300000, consumed: 0 });
  const request = () => new Request("http://127.0.0.1:5174/api/auth/request", {
    method: "POST",
    headers: { Origin: "http://127.0.0.1:5174", "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  try {
    const success = await POST(request());
    const successData = await success.json();
    const newId = successData.challengeId;
    check(success.status === 200 && newId && dbRows.get(previousId)?.consumed === 1 && dbRows.get(newId)?.consumed === 0,
      "Successful OTP delivery replaces prior live challenges only after Kavenegar accepts the new code");
    check(successData.expiresAt === fixedNow + 300000 && successData.resendAt === fixedNow + 60000 && successData.serverNow === fixedNow + 12345 && successData.resendAfter === 48 && successData.expiresIn === 288,
      "OTP response deadlines preserve insertion expiry and account for SMS delivery time");
    check(dbRows.get(newId)?.hash === `stored:${newId}:${phone}:${observedToken}`,
      "OTP challenge stores only the server-side hash of the code");

    dbRows.set(previousId, { id: previousId, phone, hash: "old", expires_at: fixedNow + 300000, consumed: 0 });
    delivery = "failure";
    const beforeFailure = new Set(dbRows.keys());
    const failed = await POST(request());
    const failedInsertions = [...dbRows.keys()].filter((id) => !beforeFailure.has(id));
    check(failed.status === 503 && dbRows.get(previousId)?.consumed === 0 && failedInsertions.length === 0,
      "Failed OTP delivery deletes its challenge and preserves the earlier live code");
    check(!logOutput.some((line) => line.includes("stub-secret-key")),
      "OTP request failures never log the Kavenegar credential");
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    console.error = originalError;
    console.log = originalLog;
  }
}
