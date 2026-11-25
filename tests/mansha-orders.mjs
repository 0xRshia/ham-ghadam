import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { nodeSourceModules } from "./node-source-module.mjs";

const directory = mkdtempSync(join(tmpdir(), "mansha-orders-"));
const origin = "https://mansha-orders.example.test";
const ordersPath = "/api/menu/mansha/orders";
const receiptPath = "/menu/mansha/receipt";
const sellerId = "mansha-test-seller";
const sellerPhone = "09990000001";
const ticketMerchantId = "test-ticket-merchant";
const menuMerchantId = "test-mansha-merchant";
const itemId = "019f1cd5-1a33-73c9-a929-fe1b38f48388"; // Menzu displays 1,630 (thousand toman).
const databasePath = join(directory, "orders.sqlite");
const gatewayCalls = [];
const realFetch = globalThis.fetch;
const realNow = Date.now;
let now = Date.now();
let database;

try {
  Object.assign(process.env, {
    APP_ORIGIN: origin,
    DATABASE_PATH: databasePath,
    MEDIA_PATH: join(directory, "media"),
    TEMP_LOGIN_ENABLED: "false",
    SEED_SAMPLE_EVENTS: "false",
    ZARINPAL_MERCHANT_ID: ticketMerchantId,
    MANSHA_SELLER_PHONE: sellerPhone,
  });
  delete process.env.MANSHA_ZARINPAL_MERCHANT_ID;
  const migrated = spawnSync(process.execPath, ["scripts/migrate-node.mjs"], { encoding: "utf8" });
  assert.equal(migrated.status, 0, migrated.stderr);
  database = new DatabaseSync(databasePath);
  const addUser = database.prepare("INSERT INTO users(id,phone,name,created_at) VALUES(?,?,?,?)");
  addUser.run(sellerId, sellerPhone, "فروشندهٔ آزمایشی", now);
  addUser.run("wrong-seller", "09990000002", "حساب دیگر", now);

  Date.now = () => now;
  let requestCount = 0;
  let failRequest = false;
  let verifyReply = { data: { code: 100, ref_id: 12345 } };
  globalThis.fetch = async (url, init) => {
    const match = /^https:\/\/payment\.zarinpal\.com\/pg\/v4\/payment\/(request|verify)\.json$/.exec(String(url));
    assert.ok(match, "No real network requests are allowed by this test");
    assert.equal(init.method, "POST");
    const action = match[1];
    gatewayCalls.push({ action, data: JSON.parse(init.body) });
    if (action === "verify") return Response.json(verifyReply);
    if (failRequest) return Response.json({ errors: { code: -1 } }, { status: 500 });
    return Response.json({ data: { code: 100, authority: `TEST-AUTHORITY-${++requestCount}` } });
  };

  const load = nodeSourceModules(join(directory, "modules"));
  const orders = await load("app/api/menu/mansha/orders/route.ts");
  const callback = await load("app/api/menu/mansha/orders/callback/route.ts");
  const verify = await load("app/api/menu/mansha/orders/verify/route.ts");
  const { MANSHA_BUYER_COOKIE, getManshaReceipt, getManshaSellerReceipt, manshaCheckoutAvailable } = await load("lib/mansha-orders.ts");

  const buyer = { itemId, quantity: 2, name: " نام آزمایشی ", phone: "۰۹۹۹۰۰۰۰۰۰۳" };
  const payload = { ...buyer, requestKey: crypto.randomUUID() };
  async function post(handler, route, data, expected, { cookie, source = origin } = {}) {
    const headers = { Origin: source, "Content-Type": "application/json" };
    if (cookie) headers.Cookie = cookie;
    const response = await handler(new Request(origin + route, { method: "POST", headers, body: JSON.stringify(data) }));
    const result = await response.json();
    assert.equal(response.status, expected, JSON.stringify(result));
    return { result, header: response.headers.get("set-cookie") };
  }
  async function paymentReturn(authority, status) {
    const search = new URLSearchParams({ Authority: authority, Status: status });
    const response = await callback.GET(new Request(`${origin}${ordersPath}/callback?${search}`));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("cache-control"), "no-store");
    return new URL(response.headers.get("location"));
  }
  const row = authority => database.prepare("SELECT * FROM mansha_orders WHERE authority=?").get(authority);
  const notices = () => database.prepare("SELECT user_id,href FROM notifications WHERE kind='mansha_order' ORDER BY created_at").all();
  const dispatch = data => post(orders.POST, ordersPath, data, 200);
  const verifyOrder = (orderId, cookie, expected = 200) => post(verify.POST, `${ordersPath}/verify`, { orderId }, expected, { cookie });
  const testCookie = (value = "b") => `${MANSHA_BUYER_COOKIE}=${value.repeat(64)}`;

  assert.equal(await manshaCheckoutAvailable(), false);
  await post(orders.POST, ordersPath, payload, 503);
  process.env.MANSHA_ZARINPAL_MERCHANT_ID = menuMerchantId;
  process.env.MANSHA_SELLER_PHONE = "09990000009";
  assert.equal(await manshaCheckoutAvailable(), false);
  await post(orders.POST, ordersPath, payload, 503);
  process.env.MANSHA_SELLER_PHONE = sellerPhone;
  assert.equal(await manshaCheckoutAvailable(), true);
  await post(orders.POST, ordersPath, payload, 403, { source: "https://other-site.example.test" });
  for (const invalid of [{ itemId: "unknown" }, { quantity: "2" }, { quantity: 11 }, { requestKey: "invalid" }, { phone: "123" }]) {
    await post(orders.POST, ordersPath, { ...payload, ...invalid }, 400);
  }
  assert.equal(gatewayCalls.length, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM mansha_orders").get().count, 0);

  const first = await dispatch({ ...payload, amountToman: 1 });
  assert.equal(first.result.paymentUrl, "https://payment.zarinpal.com/pg/StartPay/TEST-AUTHORITY-1");
  assert.match(first.header, /; HttpOnly; Path=\/; SameSite=Lax;.*; Secure$/);
  const firstCookie = first.header.split(";")[0];
  const firstToken = firstCookie.slice(MANSHA_BUYER_COOKIE.length + 1);
  assert.match(firstToken, /^[a-f0-9]{64}$/);
  const firstOrder = row("TEST-AUTHORITY-1");
  assert.equal(firstOrder.amount_toman, 3_260_000);
  assert.notEqual(firstOrder.buyer_session_hash, firstToken);
  assert.equal(gatewayCalls[0].action, "request");
  assert.equal(gatewayCalls[0].data.amount, 32_600_000);
  assert.equal(gatewayCalls[0].data.currency, "IRR");
  assert.equal(gatewayCalls[0].data.merchant_id, menuMerchantId);
  assert.equal(gatewayCalls[0].data.callback_url, origin + ordersPath + "/callback");
  assert.equal(gatewayCalls[0].data.metadata.order_id, firstOrder.id);
  const repeated = await post(orders.POST, ordersPath, payload, 200, { cookie: firstCookie });
  assert.deepEqual(repeated.result, first.result);
  await post(orders.POST, ordersPath, { ...payload, quantity: 3 }, 409, { cookie: firstCookie });
  assert.equal(gatewayCalls.length, 1);

  const cancelled = await paymentReturn("TEST-AUTHORITY-1", "NOK");
  assert.equal(cancelled.pathname, receiptPath);
  assert.equal(cancelled.searchParams.get("order"), firstOrder.id);
  assert.equal(cancelled.searchParams.get("payment"), "cancelled");
  assert.equal(gatewayCalls.length, 1);
  assert.deepEqual(notices(), []);
  assert.equal(await getManshaSellerReceipt(firstOrder.id, sellerId), null);
  const unknownCallback = await paymentReturn("UNKNOWN-AUTHORITY", "OK");
  assert.equal(unknownCallback.href, origin + receiptPath);

  const successful = await dispatch({ ...buyer, requestKey: crypto.randomUUID() });
  const successOrder = row("TEST-AUTHORITY-2");
  const successCookie = successful.header.split(";")[0];
  const successToken = successCookie.slice(MANSHA_BUYER_COOKIE.length + 1);
  assert.equal(await getManshaReceipt(successOrder.id, firstToken), null);
  assert.equal(await getManshaReceipt(successOrder.id, undefined), null);
  await verifyOrder(successOrder.id, firstCookie, 404);
  await verifyOrder(successOrder.id, undefined, 404);
  assert.equal(gatewayCalls.length, 2);

  const paid = await paymentReturn("TEST-AUTHORITY-2", "OK");
  assert.equal(paid.searchParams.get("order"), successOrder.id);
  assert.equal(paid.searchParams.get("payment"), "success");
  assert.deepEqual(gatewayCalls.at(-1), { action: "verify", data: { amount: 32_600_000, authority: "TEST-AUTHORITY-2", merchant_id: menuMerchantId } });
  const buyerReceipt = await getManshaReceipt(successOrder.id, successToken);
  assert.equal(buyerReceipt.status, "paid");
  assert.equal(buyerReceipt.amountToman, 3_260_000);
  assert.equal(buyerReceipt.paymentReference, "12345");
  assert.equal(buyerReceipt.buyerName, undefined);
  assert.equal(buyerReceipt.buyerPhone, undefined);
  assert.equal(await getManshaSellerReceipt(successOrder.id, "wrong-seller"), null);
  const sellerReceipt = await getManshaSellerReceipt(successOrder.id, sellerId);
  assert.equal(sellerReceipt.buyerName, "نام آزمایشی");
  assert.equal(sellerReceipt.buyerPhone, "09990000003");
  assert.equal((await verifyOrder(successOrder.id, successCookie)).result.status, "paid");
  assert.equal((await paymentReturn("TEST-AUTHORITY-2", "OK")).href, paid.href);
  assert.equal(gatewayCalls.length, 3);
  assert.deepEqual(notices().map(notice => ({ ...notice })), [{ user_id: sellerId, href: `/menu/mansha/seller/${successOrder.id}` }]);

  const retryPayload = { ...buyer, requestKey: crypto.randomUUID() };
  failRequest = true;
  const failed = await post(orders.POST, ordersPath, retryPayload, 502);
  const retryCookie = failed.header.split(";")[0];
  assert.ok(retryCookie.startsWith(`${MANSHA_BUYER_COOKIE}=`));
  const failedOrder = database.prepare("SELECT id,status FROM mansha_orders WHERE request_key=?").get(retryPayload.requestKey);
  assert.equal(failedOrder.status, "failed");
  failRequest = false;
  await post(orders.POST, ordersPath, retryPayload, 200, { cookie: retryCookie });
  const retryOrder = row("TEST-AUTHORITY-3");
  assert.equal(retryOrder.id, failedOrder.id);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM mansha_orders WHERE request_key=?").get(retryPayload.requestKey).count, 1);

  verifyReply = { errors: { code: -51 } };
  const pending = await paymentReturn("TEST-AUTHORITY-3", "OK");
  assert.equal(pending.searchParams.get("payment"), "pending");
  assert.equal(notices().length, 1);
  await verifyOrder(retryOrder.id, testCookie(), 404);
  verifyReply = { data: { code: 101, ref_id: 67890 } };
  const previousCallCount = gatewayCalls.length;
  assert.equal((await verifyOrder(retryOrder.id, retryCookie)).result.status, "pending");
  assert.equal(gatewayCalls.length, previousCallCount, "The cooldown suppresses an immediate gateway retry");
  now += 5_000;
  assert.equal((await verifyOrder(retryOrder.id, retryCookie)).result.status, "paid");
  assert.equal(notices().filter(notice => notice.href.endsWith(retryOrder.id)).length, 1);
  console.log("PASS Mansha checkout configuration, exact amounts, idempotency, cancellation, retries and receipt ownership");
} finally {
  Date.now = realNow;
  globalThis.fetch = realFetch;
  database?.close();
  rmSync(directory, { recursive: true, force: true });
}
