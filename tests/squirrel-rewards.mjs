import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { nodeSourceModules } from "./node-source-module.mjs";

const scratch = mkdtempSync(join(tmpdir(), "squirrel-rewards-"));
const databasePath = join(scratch, "rewards.sqlite");
const gameOrigin = "https://game.hmghadam.com";
const rewardPath = "/game/reward";
const realNow = Date.now;
const realFetch = globalThis.fetch;
let now = realNow();
let database;

try {
  Object.assign(process.env, {
    APP_ORIGIN: "https://app.hmghadam.com",
    DATABASE_PATH: databasePath,
    MEDIA_PATH: join(scratch, "media"),
    TEMP_LOGIN_ENABLED: "false",
    SEED_SAMPLE_EVENTS: "false",
  });
  delete process.env.SQUIRREL_REWARD_LIMIT;
  const migrated = spawnSync(process.execPath, ["scripts/migrate-node.mjs"], { encoding: "utf8" });
  assert.equal(migrated.status, 0, migrated.stderr);
  database = new DatabaseSync(databasePath);
  Date.now = () => now;
  globalThis.fetch = () => { throw new Error("Reward tests must never make network requests"); };

  const load = nodeSourceModules(join(scratch, "modules"));
  const sessionRoute = await load("app/game/reward/session/route.ts");
  const claimRoute = await load("app/game/reward/claim/route.ts");
  const { advanceWorldGame, ballisticShot, beginWorldCatch, initialWorldGame, maxMovementZone, placeWorldGame,
    worldSquirrelPosition, worldTiming } = await load("lib/squirrel-ar-game.ts");

  async function post(handler, path, data, { cookie, origin = gameOrigin } = {}) {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (origin) headers.set("Origin", origin);
    if (cookie) headers.set("Cookie", cookie);
    const response = await handler(new Request(gameOrigin + rewardPath + path, { method: "POST", headers, body: JSON.stringify(data) }));
    assert.equal(response.headers.get("cache-control"), "no-store");
    return { status: response.status, body: await response.json(), setCookie: response.headers.get("set-cookie") };
  }

  const start = options => post(sessionRoute.POST, "/session", {}, options);
  const claim = (data, options) => post(claimRoute.POST, "/claim", data, options);
  const counts = table => database.prepare(`SELECT count(*) AS value FROM ${table}`).get().value;
  const claimInput = ({ id, seed }) => {
    const anchor = { x: 0, y: 0, z: 0 };
    const round = 1, encounterMs = 1600, launchMs = 800, impactMs = 440, impactStepMs = 16;
    const zone = maxMovementZone, scale = 1, reducedMotion = false;
    let state = placeWorldGame(initialWorldGame(seed), anchor, 0, zone);
    state = advanceWorldGame(state, worldTiming.waiting, true);
    state = advanceWorldGame(state, worldTiming.entering, true);
    state = advanceWorldGame(state, encounterMs, true);
    state = advanceWorldGame(beginWorldCatch(state), launchMs + impactMs, true);
    const target = worldSquirrelPosition(state);
    const { origin, velocity } = ballisticShot({ x: 0, y: 1.4, z: 2 }, { ...target, y: .28 }, impactMs / 1000);
    return { sessionId: id, proof: { round, encounterMs, launchMs, impactMs, impactStepMs, origin, velocity, zone, scale, reducedMotion } };
  };

  assert.equal((await start()).status, 503);
  assert.equal((await claim({})).status, 503);
  for (const disabled of ["0", "-5", "abc", "1.5"]) {
    process.env.SQUIRREL_REWARD_LIMIT = disabled;
    assert.equal((await start()).status, 503);
  }
  process.env.SQUIRREL_REWARD_LIMIT = "2";
  for (const origin of [null, "https://other.example.test"]) {
    assert.equal((await start({ origin })).status, 403);
    assert.equal((await claim({}, { origin })).status, 403);
  }
  assert.equal(counts("squirrel_reward_sessions"), 0);

  const browser = await start();
  assert.equal(browser.status, 200);
  assert.match(browser.setCookie, /^hg_fandogh_reward=[a-f0-9]{64}; Path=\/game\/reward; HttpOnly; SameSite=Lax; .*; Secure$/);
  const browserCookie = browser.setCookie.split(";")[0];
  const sessionRow = database.prepare("SELECT browser_hash FROM squirrel_reward_sessions WHERE id=?").get(browser.body.id);
  assert.match(sessionRow.browser_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(browserCookie.split("=")[1], sessionRow.browser_hash);
  assert.equal(browser.body.expiresAt, now + 45 * 60_000);
  const tabs = await Promise.all([start({ cookie: browserCookie }), start({ cookie: browserCookie })]);
  for (const tab of tabs) assert.deepEqual(tab.body, browser.body);
  assert.equal(counts("squirrel_reward_sessions"), 1);

  const input = claimInput(browser.body);
  assert.equal((await claim(input)).status, 400);
  assert.equal((await claim({ ...input, sessionId: "wrong-id" }, { cookie: browserCookie })).status, 400);
  assert.equal((await claim(input, { cookie: browserCookie })).status, 400, "A fresh session cannot immediately claim a coupon");
  const second = await start();
  const secondCookie = second.setCookie.split(";")[0];
  const third = await start();
  const thirdCookie = third.setCookie.split(";")[0];
  assert.equal((await claim(input, { cookie: secondCookie })).status, 410, "A session belongs to its original browser cookie");
  now += 4500;
  assert.equal((await claim(input, { cookie: browserCookie })).status, 400, "An otherwise valid catch cannot happen before its reported round time");
  now += 5500;
  assert.equal((await claim({ sessionId: input.sessionId }, { cookie: browserCookie })).status, 400);
  assert.equal((await claim({ ...input, proof: { caught: true } }, { cookie: browserCookie })).status, 400);
  const miss = { ...input, proof: { ...input.proof, velocity: { ...input.proof.velocity, x: 15 } } };
  assert.equal((await claim(miss, { cookie: browserCookie })).status, 400);
  assert.equal(counts("squirrel_reward_coupons"), 0);

  const firstClaims = await Promise.all([claim(input, { cookie: browserCookie }), claim(input, { cookie: browserCookie })]);
  const coupon = firstClaims[0].body;
  assert.match(coupon.code, /^FND-[0-9A-F]{24}$/);
  assert.equal(coupon.amountToman, 300_000);
  assert.equal(coupon.redeemHref, "https://app.hmghadam.com/events");
  for (const result of firstClaims) {
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, coupon);
  }
  assert.equal(counts("squirrel_reward_coupons"), 1);
  assert.deepEqual((await start({ cookie: browserCookie })).body.coupon, coupon);
  assert.deepEqual((await claim(input, { cookie: browserCookie })).body, coupon);

  const remaining = await Promise.all([
    claim(claimInput(second.body), { cookie: secondCookie }),
    claim(claimInput(third.body), { cookie: thirdCookie }),
  ]);
  assert.deepEqual(remaining.map(result => result.status).sort(), [200, 409]);
  const lastCoupon = remaining.find(result => result.status === 200).body;
  assert.notEqual(lastCoupon.code, coupon.code);
  assert.equal(lastCoupon.amountToman, coupon.amountToman);
  assert.equal(counts("squirrel_reward_coupons"), 2);

  const [unawarded, unawardedCookie] = remaining[0].status === 409 ? [second, secondCookie] : [third, thirdCookie];
  now = unawarded.body.expiresAt + 1;
  assert.equal((await claim(claimInput(unawarded.body), { cookie: unawardedCookie })).status, 410);
  const renewed = await start({ cookie: unawardedCookie });
  assert.notEqual(renewed.body.id, unawarded.body.id);
  assert.equal(renewed.body.expiresAt, now + 45 * 60_000);
  assert.equal(renewed.body.coupon, undefined);
  const restored = await start({ cookie: browserCookie });
  assert.notEqual(restored.body.id, browser.body.id);
  assert.deepEqual(restored.body.coupon, coupon, "An expired game session cannot erase the browser's coupon");
  assert.deepEqual((await claim(claimInput(restored.body), { cookie: browserCookie })).body, coupon);
  assert.equal(counts("squirrel_reward_coupons"), 2);

  delete process.env.SQUIRREL_REWARD_LIMIT;
  process.env.APP_ORIGIN = "https://stage.hmghadam.com";
  assert.equal((await start()).status, 200, "Stage has a default test campaign");
  process.env.SQUIRREL_REWARD_LIMIT = "0";
  assert.equal((await start()).status, 503, "Explicit disable also overrides the Stage default");
  console.log("PASS squirrel reward sessions, seeded claim validation, same-browser replays, concurrent cap and expiry");
} finally {
  Date.now = realNow;
  globalThis.fetch = realFetch;
  database?.close();
  rmSync(scratch, { recursive: true, force: true });
}
