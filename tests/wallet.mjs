import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout } from "node:timers/promises";
import { nodeSourceModules } from "./node-source-module.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "wallet-"));
const origin = "https://wallet-tests.example.test";
process.env.DATABASE_PATH = path.join(directory, "wallet.sqlite");
process.env.MEDIA_PATH = path.join(directory, "media");
process.env.APP_ORIGIN = origin;
process.env.TEMP_LOGIN_ENABLED = "false";
process.env.SEED_SAMPLE_EVENTS = "false";
delete process.env.ZARINPAL_MERCHANT_ID;
const load = nodeSourceModules(path.join(directory, "modules"));
const db = new DatabaseSync(process.env.DATABASE_PATH);
db.exec("PRAGMA foreign_keys=ON");
// The gateway is the only external dependency; requests to it are recorded and
// answered by the test, everything else runs against real SQLite and routes.
const gatewayCalls = [];
let gatewayResponse = () => { throw new Error("Unexpected gateway call"); };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (!String(url).startsWith("https://payment.zarinpal.com/")) return realFetch(url, init);
  const payload = JSON.parse(init.body);
  gatewayCalls.push({ method: String(url).split("/").pop(), payload });
  return Response.json(gatewayResponse(payload));
};

try {
  const { entries } = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
  for (const entry of entries) db.exec(fs.readFileSync(`drizzle/${entry.tag}.sql`, "utf8"));
  const now = Date.now();
  db.prepare("INSERT INTO users(id,phone,name,created_at) VALUES(?,?,?,?),(?,?,?,?)").run("full", "09120000001", "کاربر سقف", now, "payer", "09120000002", "کاربر پرداخت", now);

  const limits = await load("lib/wallet-limits.ts");
  assert.equal(limits.walletAmountError(1000, 0), null);
  assert.equal(limits.walletAmountError(999, 0), "below");
  assert.equal(limits.walletAmountError(10_000_001, 0), "above");
  assert.equal(limits.walletAmountError(10_000_000, 0), null);
  assert.equal(limits.walletAmountError(2000, 9_999_000), "cap");
  assert.equal(limits.walletAmountError(1000.5, 0), "invalid");
  assert.equal(limits.walletAmountError("1000", 0), "invalid");
  assert.equal(limits.walletTransactionState({ status: "pending", created_at: now }, now + 1000), "pending");
  assert.equal(limits.walletTransactionState({ status: "pending", created_at: now }, now + limits.WALLET_PENDING_WINDOW_MS), "expired");
  assert.equal(limits.walletTransactionState({ status: "paid_unfulfilled", created_at: now }, now), "review");
  const { parseCredits } = await load("lib/wallet-input.ts");
  assert.equal(parseCredits("۱۰۰٬۰۰۰"), 100_000);
  assert.equal(parseCredits("1,000"), 1000);
  assert.ok(Number.isNaN(parseCredits("-5")));
  assert.ok(Number.isNaN(parseCredits("12a")));
  console.log("PASS wallet amount range, balance cap, Persian input and display states");

  assert.throws(() => db.prepare("INSERT INTO wallets(user_id,balance,updated_at) VALUES('full',10000001,0)").run(), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO wallet_transactions(id,user_id,kind,amount,status,created_at) VALUES('x','full','admin_grant',999,'completed',0)").run(), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO wallets(user_id,balance,updated_at) VALUES('missing',0,0)").run(), /FOREIGN KEY/);
  console.log("PASS database constraints enforce the balance cap, transaction range and user ownership");

  const { hashPassword } = await load("lib/passwords.ts");
  const { hash } = await load("lib/server.ts");
  process.env.FAST_ADMIN_USERNAME = "wallet-tests";
  process.env.FAST_ADMIN_PASSWORD_HASH = await hashPassword("wallet-tests-password");
  const userToken = "a".repeat(64);
  db.prepare("INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,?,?)").run(await hash(userToken), "payer", now + 3_600_000);
  const sessionRoute = await load("app/api/fast/session/route.ts");
  const fastWallet = await load("app/api/fast/wallet/route.ts");
  const walletRoute = await load("app/api/wallet/route.ts");
  const topUpRoute = await load("app/api/wallet/top-ups/route.ts");
  const verifyRoute = await load("app/api/wallet/top-ups/[id]/verify/route.ts");
  const callbackRoute = await load("app/api/wallet/callback/route.ts");
  const profileRoute = await load("app/api/profile/route.ts");
  async function call(handler, method, route, { data, cookie = "", id, expected = 200 } = {}) {
    if (method !== "GET") await setTimeout(110); // Respect the real /fast write cooldown.
    const response = await handler(new Request(origin + route, { method, headers: { Origin: origin, Cookie: cookie, ...(data ? { "Content-Type": "application/json" } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) }), { params: Promise.resolve({ id }) });
    const result = response.status === 303 ? { location: response.headers.get("location") } : await response.json();
    assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(result)}`);
    return result;
  }
  const login = await sessionRoute.POST(new Request(origin + "/api/fast/session", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ username: "wallet-tests", password: "wallet-tests-password" }) }));
  const fast = login.headers.get("set-cookie").split(";")[0];
  const balance = id => db.prepare("SELECT balance FROM wallets WHERE user_id=?").get(id)?.balance ?? 0;

  await call(fastWallet.GET, "GET", "/api/fast/wallet?phone=09120000001", { expected: 401 });
  await call(fastWallet.POST, "POST", "/api/fast/wallet", { data: { phone: "09120000001", amount: 1000 }, cookie: `hg_session=${userToken}`, expected: 401 });
  await call(fastWallet.GET, "GET", "/api/fast/wallet?phone=09129999999", { cookie: fast, expected: 404 });
  const empty = await call(fastWallet.GET, "GET", "/api/fast/wallet?phone=۰۹۱۲۰۰۰۰۰۰۱", { cookie: fast });
  assert.equal(empty.user.id, "full"); assert.equal(empty.wallet.balance, 0); assert.deepEqual(empty.wallet.transactions, []);
  await call(fastWallet.POST, "POST", "/api/fast/wallet", { data: { phone: "09120000001", amount: 999 }, cookie: fast, expected: 400 });
  await call(fastWallet.POST, "POST", "/api/fast/wallet", { data: { phone: "09120000001", amount: "1000" }, cookie: fast, expected: 400 });
  await call(fastWallet.POST, "POST", "/api/fast/wallet", { data: { phone: "09120000001", amount: 1000, note: "x".repeat(201) }, cookie: fast, expected: 400 });
  const first = await call(fastWallet.POST, "POST", "/api/fast/wallet", { data: { phone: "09120000001", amount: 1000, note: " جایزه " }, cookie: fast, expected: 201 });
  assert.equal(first.transaction.balance_after, 1000); assert.equal(first.transaction.note, "جایزه"); assert.equal(first.transaction.status, "completed");
  await call(fastWallet.POST, "POST", "/api/fast/wallet", { data: { phone: "09120000001", amount: 10_000_000 }, cookie: fast, expected: 409 });
  assert.equal(balance("full"), 1000, "A refused grant leaves the balance unchanged");
  const filled = await call(fastWallet.POST, "POST", "/api/fast/wallet", { data: { phone: "09120000001", amount: 9_999_000 }, cookie: fast, expected: 201 });
  assert.equal(filled.wallet.balance, 10_000_000); assert.equal(filled.wallet.transactions.length, 2);
  await call(fastWallet.POST, "POST", "/api/fast/wallet", { data: { phone: "09120000001", amount: 1000 }, cookie: fast, expected: 409 });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM wallet_transactions WHERE user_id='full'").get().n, 2, "Refused grants are not recorded");
  console.log("PASS /fast grants require the panel session, validate range and cap, and record balance history");

  const overview = await call(walletRoute.GET, "GET", "/api/wallet", { cookie: `hg_session=${userToken}` });
  assert.equal(overview.balance, 0); assert.equal(overview.topUpAvailable, false);
  await call(walletRoute.GET, "GET", "/api/wallet", { expected: 401 });
  await call(topUpRoute.POST, "POST", "/api/wallet/top-ups", { data: { amount: 5000 }, cookie: `hg_session=${userToken}`, expected: 503 });
  assert.equal(gatewayCalls.length, 0);

  process.env.ZARINPAL_MERCHANT_ID = "00000000-0000-0000-0000-000000000000";
  await call(topUpRoute.POST, "POST", "/api/wallet/top-ups", { data: { amount: 500 }, cookie: `hg_session=${userToken}`, expected: 400 });
  gatewayResponse = () => ({ data: { code: 100, authority: "A0000000000000000000000000000000001" } });
  const started = await call(topUpRoute.POST, "POST", "/api/wallet/top-ups", { data: { amount: 250_000 }, cookie: `hg_session=${userToken}`, expected: 201 });
  assert.equal(started.url, "https://payment.zarinpal.com/pg/StartPay/A0000000000000000000000000000000001");
  assert.equal(gatewayCalls.at(-1).payload.amount, 2_500_000, "Credits are sent to Zarinpal in rial");
  assert.equal(gatewayCalls.at(-1).payload.callback_url, `${origin}/api/wallet/callback`);
  assert.equal(balance("payer"), 0, "Starting a payment does not credit the wallet");

  gatewayResponse = payload => ({ data: { code: payload.amount === 2_500_000 ? 100 : -1, ref_id: 987654 } });
  const success = await call(callbackRoute.GET, "GET", "/api/wallet/callback?Authority=A0000000000000000000000000000000001&Status=OK", { expected: 303 });
  assert.equal(success.location, `${origin}/wallet?payment=success`);
  assert.equal(balance("payer"), 250_000);
  const verifyCalls = gatewayCalls.filter(item => item.method === "verify.json").length;
  const repeated = await call(callbackRoute.GET, "GET", "/api/wallet/callback?Authority=A0000000000000000000000000000000001&Status=OK", { expected: 303 });
  assert.equal(repeated.location, `${origin}/wallet?payment=success`);
  assert.equal(balance("payer"), 250_000, "A repeated callback never credits twice");
  assert.equal(gatewayCalls.filter(item => item.method === "verify.json").length, verifyCalls);
  const stored = db.prepare("SELECT status,reference,balance_after,payment_state FROM wallet_transactions WHERE authority=?").get("A0000000000000000000000000000000001");
  assert.deepEqual({ ...stored }, { status: "completed", reference: "987654", balance_after: 250_000, payment_state: "paid" });

  const pending = (id, user, authority, amount = 5000) => db.prepare("INSERT INTO wallet_transactions(id,user_id,kind,amount,status,authority,payment_state,created_at) VALUES(?,?,'top_up',?,'pending',?,'pending',?)").run(id, user, amount, authority, Date.now());
  pending("cancelled-top-up", "payer", "A0000000000000000000000000000000002");
  const cancelled = await call(callbackRoute.GET, "GET", "/api/wallet/callback?Authority=A0000000000000000000000000000000002&Status=NOK", { expected: 303 });
  assert.equal(cancelled.location, `${origin}/wallet?payment=cancelled`);
  assert.equal(gatewayCalls.filter(item => item.method === "verify.json").length, verifyCalls, "A cancelled return is not verified");
  pending("over-cap", "full", "A0000000000000000000000000000000003");
  const limited = await call(callbackRoute.GET, "GET", "/api/wallet/callback?Authority=A0000000000000000000000000000000003&Status=OK", { expected: 303 });
  assert.equal(limited.location, `${origin}/wallet?payment=limit`);
  assert.equal(gatewayCalls.filter(item => item.method === "verify.json").length, verifyCalls, "Over-cap payments are left unverified so the gateway reverses them");
  assert.equal(db.prepare("SELECT status FROM wallet_transactions WHERE id='over-cap'").get().status, "failed");
  assert.equal(balance("full"), 10_000_000);
  const unknown = await call(callbackRoute.GET, "GET", "/api/wallet/callback?Authority=unknown&Status=OK", { expected: 303 });
  assert.equal(unknown.location, `${origin}/wallet?payment=pending`);
  console.log("PASS Zarinpal top-up credits once after server verification; cancelled and over-cap returns credit nothing");

  pending("unpaid", "payer", "A0000000000000000000000000000000004");
  pending("other-user", "full", "A0000000000000000000000000000000005");
  await call(verifyRoute.POST, "POST", "/api/wallet/top-ups/other-user/verify", { id: "other-user", cookie: `hg_session=${userToken}`, expected: 404 });
  gatewayResponse = () => ({ data: {}, errors: { code: -51 } });
  const unpaid = await call(verifyRoute.POST, "POST", "/api/wallet/top-ups/unpaid/verify", { id: "unpaid", cookie: `hg_session=${userToken}` });
  assert.equal(unpaid.outcome, "cancelled");
  assert.equal(db.prepare("SELECT status FROM wallet_transactions WHERE id='unpaid'").get().status, "failed");
  assert.equal(balance("payer"), 250_000);
  const profile = await call(profileRoute.GET, "GET", "/api/profile", { cookie: `hg_session=${userToken}` });
  assert.deepEqual(profile.wallet, { balance: 250_000 });
  const history = await call(walletRoute.GET, "GET", "/api/wallet", { cookie: `hg_session=${userToken}` });
  assert.deepEqual(history.transactions.map(item => item.status).sort(), ["cancelled", "completed", "failed"]);
  assert.ok(history.transactions.every(item => !("authority" in item) && !("user_id" in item)), "History omits gateway authority and owner fields");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  console.log("PASS status re-check is owner-scoped and gateway-decided; profile and history expose the balance");
} finally {
  globalThis.fetch = realFetch;
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
