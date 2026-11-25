import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { nodeSourceModules } from "./node-source-module.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hamghadam-coupon-"));
const origin = "https://coupon-tests.example.test";
const testMerch = "00000000-0000-0000-0000-000000000000";
const paymentAuthority = suffix => `A${String(suffix).padStart(34, "0")}`;
let authority = paymentAuthority(1);
process.env.DATABASE_PATH = path.join(directory, "events.sqlite");
process.env.APP_ORIGIN = origin;
process.env.SEED_SAMPLE_EVENTS = "true";
process.env.SKIP_PAY_DEV = "false";
process.env.TEMP_LOGIN_ENABLED = "false";
delete process.env.ZARINPAL_MERCHANT_ID;
const db = new DatabaseSync(process.env.DATABASE_PATH);
const load = nodeSourceModules(path.join(directory, "modules"));
const gatewayCalls = [];
const realFetch = globalThis.fetch;
let gatewayRejectsRequest = false;
let gatewayRequestInFlight;
let inquiry = { code: 100, status: "IN_BANK" };
globalThis.fetch = async (url, init) => {
  assert.match(String(url), /^https:\/\/payment\.zarinpal\.com\/pg\/v4\/payment\//);
  const method = String(url).split("/").pop();
  const payload = JSON.parse(init.body);
  gatewayCalls.push({ method, payload });
  if (method === "request.json") {
    if (gatewayRequestInFlight) await gatewayRequestInFlight();
    return Response.json(gatewayRejectsRequest ? { data: { code: -12 } } : { data: { code: 100, authority } });
  }
  if (method === "inquiry.json") return Response.json({ data: inquiry });
  assert.equal(method, "verify.json");
  return Response.json({ data: { code: 100, ref_id: 987654 } });
};

const now = Date.now();
function createEvent(id, price, { capacity = 6, sample = 0 } = {}) {
  db.prepare(`INSERT INTO events(id,title,description,category,venue,address,city,lat,lng,starts_at,ends_at,price,capacity,image,sample)
    VALUES(?,?,'Description','books','Venue','Address','Tehran',35.7,51.4,?,?,?,?, '',?)`)
    .run(id, id, now + 3_600_000, now + 7_200_000, price, capacity, sample);
}

function issueCoupon() {
  const session = randomUUID();
  const browser = randomUUID();
  const code = "FND-" + randomUUID().replaceAll("-", "").slice(0, 24).toUpperCase();
  db.prepare("INSERT INTO squirrel_reward_sessions(id,browser_hash,seed,issued_at,expires_at) VALUES(?,?,42,?,?)")
    .run(session, browser, now, now + 120_000);
  db.prepare("INSERT INTO squirrel_reward_coupons(code,browser_hash,session_id,issued_at) VALUES(?,?,?,?)")
    .run(code, browser, session, now);
  return code;
}

async function call(handler, token, data, id) {
  const url = `${origin}/api/reservations${id ? `/${id}` : ""}`;
  const response = await handler(new Request(url, {
    method: "POST",
    headers: { Origin: origin, Cookie: `hg_session=${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }), { params: Promise.resolve({ id }) });
  return { status: response.status, data: await response.json() };
}

let adapter;
try {
  db.exec("PRAGMA foreign_keys=ON");
  const { entries } = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
  for (const { tag } of entries) db.exec(fs.readFileSync(`drizzle/${tag}.sql`, "utf8"));
  adapter = (await load("db/node.ts")).database();
  const { POST: book } = await load("app/api/reservations/route.ts");
  const { POST: manage } = await load("app/api/reservations/[id]/route.ts");
  const { GET: paymentReturn } = await load("app/api/payments/callback/route.ts");
  const callback = async status => {
    const response = await paymentReturn(new Request(`${origin}/api/payments/callback?Authority=${authority}&Status=${status}`));
    assert.equal(response.status, 303);
    return new URL(response.headers.get("location")).searchParams.get("payment");
  };
  const tokenA = "a".repeat(64);
  const tokenB = "b".repeat(64);
  for (const [user, phone, token] of [["buyer-a", "09120000001", tokenA], ["buyer-b", "09120000002", tokenB]]) {
    db.prepare("INSERT INTO users(id,phone,name,created_at) VALUES(?,?,?,?)").run(user, phone, "کاربر آزمون", now);
    db.prepare("INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,?,?)")
      .run(createHash("sha256").update(token).digest("hex"), user, now + 3_600_000);
  }
  createEvent("standard", 130_000);
  createEvent("tiered", 290_000);
  createEvent("sample", 100_000, { sample: 1 });
  createEvent("capacity", 100_000, { capacity: 0 });
  createEvent("paid", 500_000);
  db.prepare("INSERT INTO event_ticket_tiers(id,event_id,name,price,capacity) VALUES('tier-1','tiered','عمومی',300250,1)").run();

  const firstCode = issueCoupon();
  const request = (eventId, couponCode, extra = {}) => ({ eventId, requestKey: randomUUID(), quantity: 1, couponCode, ...extra });
  const initial = request("standard", ` ${firstCode.toLowerCase()} `, { quantity: 2 });
  const covered = await call(book, tokenA, initial);
  assert.equal(covered.status, 201, JSON.stringify(covered.data));
  const { reservation: free, paymentUrl } = covered.data;
  assert.deepEqual([free.status, free.total, free.amount_rial, free.squirrel_coupon_code, free.squirrel_coupon_discount, paymentUrl],
    ["confirmed", 0, 0, firstCode, 260_000, null]);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM tickets WHERE reservation_id=?").get(free.id).n, 2);
  assert.equal(gatewayCalls.length, 0, "A fully covered order never calls Zarinpal");
  const repeated = await call(book, tokenA, { ...initial, couponCode: firstCode });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.reservation.id, free.id);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM tickets WHERE reservation_id=?").get(free.id).n, 2);
  assert.equal((await call(book, tokenA, { ...initial, couponCode: undefined })).status, 409);
  const used = await call(book, tokenB, request("standard", firstCode));
  assert.equal(used.status, 409);
  assert.equal(used.data.code, "squirrel_coupon_unavailable");
  assert.equal((await call(manage, tokenB, { action: "cancel" }, free.id)).status, 404);
  assert.equal((await call(manage, tokenA, { action: "cancel" }, free.id)).status, 200);
  const afterCancellation = await call(book, tokenA, request("standard", firstCode));
  assert.equal(afterCancellation.status, 201, JSON.stringify(afterCancellation.data));
  assert.notEqual(afterCancellation.data.reservation.id, free.id);
  console.log("PASS fully covered checkout issues tickets with payment off, retries safely, and releases a cancelled order's code");

  const stockedCode = issueCoupon();
  const malformed = await call(book, tokenA, request("standard", "bad-coupon"));
  assert.equal(malformed.status, 400);
  assert.equal(malformed.data.code, "squirrel_coupon_invalid");
  const unissued = await call(book, tokenA, request("standard", "FND-" + "F".repeat(24)));
  assert.equal(unissued.status, 409);
  assert.equal(unissued.data.code, "squirrel_coupon_unavailable");
  const sample = await call(book, tokenA, request("sample", stockedCode));
  assert.equal(sample.status, 400);
  assert.equal(sample.data.code, "squirrel_coupon_ineligible");
  assert.equal((await call(book, tokenA, request("capacity", stockedCode))).status, 409);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reservations WHERE squirrel_coupon_code=?").get(stockedCode).n, 0);
  const [racerA, racerB] = await Promise.all([
    call(book, tokenA, request("standard", stockedCode)),
    call(book, tokenB, request("standard", stockedCode)),
  ]);
  assert.deepEqual([racerA.status, racerB.status].sort(), [201, 409]);
  assert.equal((racerA.status === 409 ? racerA : racerB).data.code, "squirrel_coupon_unavailable");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reservations WHERE squirrel_coupon_code=?").get(stockedCode).n, 1);
  console.log("PASS malformed, absent, sample and capacity-rejected redemptions do not issue tickets; concurrent redemption succeeds once");

  process.env.ZARINPAL_MERCHANT_ID = testMerch;
  const tierCode = issueCoupon();
  const tierOrder = request("tiered", tierCode, { items: [{ tierId: "tier-1", quantity: 1 }] });
  const placed = await call(book, tokenA, tierOrder);
  assert.equal(placed.status, 201, JSON.stringify(placed.data));
  const paid = placed.data.reservation;
  assert.deepEqual([paid.status, paid.total, paid.amount_rial, paid.squirrel_coupon_discount], ["hold", 1_000, 10_000, 299_250]);
  assert.match(placed.data.paymentUrl, new RegExp(`${authority}$`));
  assert.equal(gatewayCalls.at(-1).payload.amount, 10_000);
  assert.equal(db.prepare("SELECT unit_price FROM reservation_items WHERE reservation_id=?").get(paid.id).unit_price, 300_250);
  const otherTier = await call(book, tokenA, request("tiered", issueCoupon(), { items: tierOrder.items }));
  assert.equal(otherTier.status, 409, "A coupon never overrides tier capacity");
  db.prepare("UPDATE reservations SET expires_at=? WHERE id=?").run(now - 1, paid.id);
  const lateHold = await call(book, tokenB, request("standard", tierCode));
  assert.equal(lateHold.status, 409);
  assert.equal(lateHold.data.code, "squirrel_coupon_unavailable");
  const verified = await call(manage, tokenA, { action: "verify" }, paid.id);
  assert.equal(verified.status, 200, JSON.stringify(verified.data));
  assert.equal(verified.data.reservation.status, "confirmed");
  assert.equal(gatewayCalls.at(-1).payload.amount, 10_000);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM tickets WHERE reservation_id=?").get(paid.id).n, 1);
  console.log("PASS tier checkout preserves list-price inventory, charges the gateway minimum net, and prevents reuse during late settlement");

  gatewayRejectsRequest = true;
  const declinedCode = issueCoupon();
  const refused = await call(book, tokenA, request("paid", declinedCode));
  assert.equal(refused.status, 502, JSON.stringify(refused.data));
  assert.equal(gatewayCalls.at(-1).payload.amount, 2_000_000);
  const declined = db.prepare("SELECT status, authority FROM reservations WHERE squirrel_coupon_code=?").get(declinedCode);
  assert.deepEqual({ ...declined }, { status: "failed", authority: null });
  assert.equal((await call(book, tokenA, request("standard", declinedCode))).status, 201);
  console.log("PASS an explicit gateway failure without an authority releases the coupon for another order");

  gatewayRejectsRequest = false;
  authority = paymentAuthority(2);
  const abandonedCode = issueCoupon();
  const abandoned = await call(book, tokenA, request("paid", abandonedCode));
  assert.equal(abandoned.status, 201);
  const oldId = abandoned.data.reservation.id;
  const oldRow = () => db.prepare("SELECT status,payment_state,authority FROM reservations WHERE id=?").get(oldId);
  const clearInquiryLimit = () => db.prepare("DELETE FROM rate_limits WHERE key=?").run("squirrel-coupon-inquiry:" + authority);

  assert.equal(await callback("NOK"), "pending");
  assert.equal(oldRow().status, "hold", "A browser NOK cannot release a payment that remains in the bank");
  assert.deepEqual(gatewayCalls.at(-1), { method: "inquiry.json", payload: { authority, merchant_id: testMerch } });
  inquiry = { code: -1, status: "FAILED" };
  clearInquiryLimit();
  assert.equal(await callback("NOK"), "pending");
  assert.equal(oldRow().status, "hold", "An unsuccessful inquiry cannot release the code");
  inquiry = { code: 100, status: "FAILED" };
  clearInquiryLimit();
  assert.equal(await callback("NOK"), "cancelled");
  assert.deepEqual({ ...oldRow() }, { status: "cancelled", payment_state: "cancelled", authority });
  const reused = await call(book, tokenA, request("tiered", abandonedCode, { items: tierOrder.items }));
  assert.equal(reused.status, 409, "Releasing a code cannot override a sold-out tier");
  const gatewayCallCount = gatewayCalls.length;
  assert.equal(await callback("OK"), "cancelled");
  assert.equal((await call(manage, tokenA, { action: "verify" }, oldId)).status, 409);
  assert.equal(gatewayCalls.length, gatewayCallCount, "A late OK or manual check cannot verify a cancelled payment");

  authority = paymentAuthority(3);
  const reversed = await call(book, tokenA, request("paid", abandonedCode));
  assert.equal(reversed.status, 201, JSON.stringify(reversed.data));
  inquiry = { code: 100, status: "REVERSED" };
  const newPaid = request("paid", abandonedCode);
  const otherOwner = await call(book, tokenB, newPaid);
  assert.equal(otherOwner.status, 409);
  assert.equal(gatewayCalls.at(-1).method, "request.json", "A different buyer cannot reconcile an existing hold");
  const reversedId = reversed.data.reservation.id;
  authority = paymentAuthority(4);
  const following = await call(book, tokenA, newPaid);
  assert.equal(following.status, 201, JSON.stringify(following.data));
  assert.equal(db.prepare("SELECT status FROM reservations WHERE id=?").get(reversedId).status, "cancelled");
  console.log("PASS gateway inquiry releases only terminal payments, preserves authority and blocks verification after cancellation");

  const enteredGateway = Promise.withResolvers();
  const finishGateway = Promise.withResolvers();
  gatewayRequestInFlight = () => {
    enteredGateway.resolve();
    return finishGateway.promise;
  };
  authority = paymentAuthority(5);
  const racingCode = issueCoupon();
  const slowRequest = call(book, tokenA, request("paid", racingCode));
  await enteredGateway.promise;
  const expiredId = db.prepare("SELECT id FROM reservations WHERE squirrel_coupon_code=?").get(racingCode).id;
  try {
    const stillLive = await call(book, tokenA, request("standard", racingCode));
    assert.equal(stillLive.status, 409);
    db.prepare("UPDATE reservations SET expires_at=? WHERE id=?").run(now - 1, expiredId);
    const restored = await call(book, tokenA, request("standard", racingCode));
    assert.equal(restored.status, 201, JSON.stringify(restored.data));
    assert.equal(restored.data.paymentUrl, null);
  } finally {
    finishGateway.resolve();
  }
  const lateRequest = await slowRequest;
  assert.equal(lateRequest.status, 409);
  assert.equal(lateRequest.data.paymentUrl, undefined);
  assert.deepEqual({ ...db.prepare("SELECT status,authority FROM reservations WHERE id=?").get(expiredId) },
    { status: "cancelled", authority: null });
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  console.log("PASS an expired hold without an authority releases the code before a racing gateway response can expose a payment URL");
} finally {
  globalThis.fetch = realFetch;
  adapter?.prepare("").connection.close();
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
