import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { nodeSourceModules } from "./node-source-module.mjs";

const scratch = mkdtempSync(join(tmpdir(), "squirrel-rewards-"));
const databasePath = join(scratch, "rewards.sqlite");
const gameOrigin = "https://game.hmghadam.com";
const appOrigin = "https://app.hmghadam.com";
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
  const redeemRoute = await load("app/game/reward/redeem/route.ts");
  const { squirrelRewardCreditHeader, squirrelRewardCreditMode } = await load("lib/squirrel-reward-credit.ts");
  const { squirrelPlayEndpoint } = await load("lib/squirrel-reward-receive.ts");
  assert.equal(squirrelPlayEndpoint(gameOrigin, "session"), appOrigin + rewardPath + "/session");
  assert.equal(squirrelPlayEndpoint("http://localhost:5173", "claim"), rewardPath + "/claim");
  for (const route of [sessionRoute, claimRoute]) {
    const preflight = origin => route.OPTIONS(new Request(appOrigin + rewardPath, {
      method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
    }));
    assert.equal(preflight(gameOrigin).status, 204);
    assert.equal(preflight(gameOrigin).headers.get("Access-Control-Allow-Origin"), gameOrigin);
    assert.equal(preflight(gameOrigin).headers.get("Access-Control-Allow-Credentials"), "true");
    assert.equal(preflight("https://stage.hmghadam.com").status, 403);
  }
  const { walletOverview } = await load("lib/wallet.ts");
  const { advanceWorldGame, ballisticShot, beginWorldCatch, currentWorldMovementVersion, initialWorldGame,
    movementZoneLimit, placeWorldGame, squirrelMovementVersionHeader, worldSquirrelPosition, worldTiming } = await load("lib/squirrel-ar-game.ts");

  async function post(handler, path, data, { cookie, host = appOrigin, origin = host, movementHeader, modeHeader } = {}) {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (origin) headers.set("Origin", origin);
    if (cookie) headers.set("Cookie", cookie);
    if (movementHeader) headers.set(squirrelMovementVersionHeader, movementHeader);
    if (modeHeader) headers.set(squirrelRewardCreditHeader, modeHeader);
    const response = await handler(new Request(host + rewardPath + path, { method: "POST", headers, body: JSON.stringify(data) }));
    assert.equal(response.headers.get("cache-control"), "no-store");
    return { status: response.status, body: await response.json(), setCookie: response.headers.get("set-cookie") };
  }

  const start = options => post(sessionRoute.POST, "/session", {}, {
    movementHeader: String(currentWorldMovementVersion), modeHeader: squirrelRewardCreditMode, ...options,
  });
  const claim = (data, options) => post(claimRoute.POST, "/claim", data, options);
  const redeem = (token, options) => post(redeemRoute.POST, "/redeem", { token }, options);
  const counts = table => database.prepare(`SELECT count(*) AS value FROM ${table}`).get().value;
  const sha = token => createHash("sha256").update(token).digest("hex");
  const readCookie = response => response.setCookie.split(";")[0];
  const combineCookies = (...cookies) => cookies.join("; ");
  function account(id, index) {
    const token = sha(id);
    database.prepare("INSERT INTO users(id,phone,name,created_at) VALUES(?,?,?,?)").run(id, `0999000000${index}`, id, now);
    database.prepare("INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,?,?)").run(sha(token), id, now + 86_400_000);
    return { id, cookie: `hg_session=${token}` };
  }

  const claimInput = ({ id, seed, movementVersion }) => {
    const anchor = { x: 0, y: 0, z: 0 };
    const round = 1, encounterMs = 1600, launchMs = 800, impactMs = 440, impactStepMs = 16;
    const zone = movementZoneLimit(movementVersion), scale = 1, reducedMotion = false;
    let state = placeWorldGame(initialWorldGame(seed, movementVersion), anchor, 0, zone);
    state = advanceWorldGame(state, worldTiming.waiting, true);
    state = advanceWorldGame(state, worldTiming.entering, true);
    state = advanceWorldGame(state, encounterMs, true);
    state = advanceWorldGame(beginWorldCatch(state), launchMs + impactMs, true);
    const target = worldSquirrelPosition(state);
    const { origin, velocity } = ballisticShot({ x: 0, y: 1.4, z: 2 }, { ...target, y: .28 }, impactMs / 1000);
    return { sessionId: id, proof: { round, encounterMs, launchMs, impactMs, impactStepMs, origin, velocity, zone, scale, reducedMotion } };
  };

  const winner = account("winner", 1);
  const second = account("second", 2);
  const third = account("third", 3);
  const full = account("full", 4);
  const transferred = account("transferred", 5);
  const other = account("other", 6);
  const atLimit = account("at-limit", 7);
  assert.equal((await start()).status, 401, "The production campaign is enabled and the account endpoint requires login");
  process.env.APP_ORIGIN = "http://localhost:5173";
  assert.equal((await start()).status, 503);
  process.env.APP_ORIGIN = appOrigin;
  for (const disabled of ["0", "-5", "abc", "1.5"]) {
    process.env.SQUIRREL_REWARD_LIMIT = disabled;
    assert.equal((await start({ cookie: winner.cookie })).status, 503);
  }
  process.env.SQUIRREL_REWARD_LIMIT = "2";
  assert.equal((await start()).status, 401);
  assert.equal((await claim({})).status, 401);
  for (const origin of [null, "https://other.example.test"]) {
    assert.equal((await start({ origin, cookie: winner.cookie })).status, 403);
    assert.equal((await claim({}, { origin, cookie: winner.cookie })).status, 403);
  }
  assert.equal(counts("squirrel_reward_sessions"), 0);

  const first = await start({ cookie: winner.cookie });
  assert.equal(first.status, 200);
  assert.equal(first.body.movementVersion, currentWorldMovementVersion);
  assert.equal(first.body.perspectiveZone, true);
  assert.match(first.setCookie, /^hg_fandogh_reward=[a-f0-9]{64}; Path=\/game\/reward; HttpOnly; SameSite=Lax; .*; Secure$/);
  const browserCookie = readCookie(first);
  const cookie = combineCookies(winner.cookie, browserCookie);
  const session = database.prepare("SELECT browser_hash,user_id,reward_mode FROM squirrel_reward_sessions WHERE id=?").get(first.body.id);
  assert.equal(session.browser_hash, sha(browserCookie.split("=")[1]));
  assert.equal(session.user_id, winner.id);
  assert.equal(session.reward_mode, "wallet");
  assert.equal(first.body.expiresAt, now + 45 * 60_000);
  assert.deepEqual((await start({ cookie })).body, first.body);
  assert.equal((await start({ cookie, modeHeader: null })).status, 409, "An older coupon client must refresh");
  assert.equal((await start({ cookie, movementHeader: "1" })).status, 409);
  assert.equal(counts("squirrel_reward_sessions"), 1);

  const input = claimInput(first.body);
  assert.equal((await claim(input, { cookie: browserCookie })).status, 401, "A loss of login prevents an award");
  assert.equal((await claim(input, { cookie: winner.cookie })).status, 400, "A session belongs to its original browser");
  assert.equal((await claim(input, { cookie: combineCookies(second.cookie, browserCookie) })).status, 410, "An account switch cannot claim another user's session");
  assert.equal((await claim(input, { cookie })).status, 400, "A fresh session cannot immediately claim a win");

  const secondPlay = await start({ cookie: second.cookie });
  const thirdPlay = await start({ cookie: third.cookie });
  const secondCookie = combineCookies(second.cookie, readCookie(secondPlay));
  const thirdCookie = combineCookies(third.cookie, readCookie(thirdPlay));
  now += 10_000;
  assert.equal((await claim({ ...input, proof: { caught: true } }, { cookie })).status, 400);
  const miss = { ...input, proof: { ...input.proof, velocity: { ...input.proof.velocity, x: 15 } } };
  assert.equal((await claim(miss, { cookie })).status, 400);
  assert.equal(counts("wallet_transactions"), 0);

  const claims = await Promise.all([claim(input, { cookie }), claim({ ...input, amount: 300_000 }, { cookie })]);
  const reward = { amountToman: 100_000, balanceAfter: 100_000, walletHref: "/wallet" };
  for (const result of claims) {
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { reward });
  }
  const wallet = await walletOverview(winner.id);
  assert.equal(wallet.balance, 100_000);
  assert.equal(wallet.transactions.length, 1);
  assert.equal(wallet.transactions[0].kind, "game_reward");
  assert.equal(wallet.transactions[0].amount, 100_000);
  assert.equal(wallet.transactions[0].balance_after, 100_000);
  assert.deepEqual((await start({ cookie })).body.reward, reward);
  const anotherBrowser = await start({ cookie: winner.cookie });
  assert.deepEqual(anotherBrowser.body.reward, reward, "The award follows the account across browsers");

  const remaining = await Promise.all([
    claim(claimInput(secondPlay.body), { cookie: secondCookie }),
    claim(claimInput(thirdPlay.body), { cookie: thirdCookie }),
  ]);
  assert.deepEqual(remaining.map(result => result.status).sort(), [200, 409], "Only one account can claim the last campaign slot");
  assert.equal(counts("wallet_transactions"), 2);
  assert.equal(counts("squirrel_reward_coupons"), 0);

  process.env.SQUIRREL_REWARD_LIMIT = "10";
  const nearlyFullPlay = await start({ cookie: full.cookie });
  const fullCookie = combineCookies(full.cookie, readCookie(nearlyFullPlay));
  database.prepare("INSERT INTO wallets(user_id,balance,updated_at) VALUES(?,?,?)").run(full.id, 9_900_001, now);
  const dedicatedPlay = await start({ host: gameOrigin });
  assert.equal(dedicatedPlay.status, 200);
  const dedicatedCookie = readCookie(dedicatedPlay);
  now += 10_000;
  assert.equal((await claim(claimInput(nearlyFullPlay.body), { cookie: fullCookie })).status, 409);
  assert.equal((await walletOverview(full.id)).balance, 9_900_001);
  assert.equal((await walletOverview(full.id)).transactions.length, 0);
  const dedicatedClaim = await claim(claimInput(dedicatedPlay.body), { host: gameOrigin, cookie: dedicatedCookie });
  assert.equal(dedicatedClaim.status, 200);
  const handoff = new URL(dedicatedClaim.body.continueHref);
  assert.equal(handoff.origin + handoff.pathname, appOrigin + rewardPath + "/receive");
  assert.match(handoff.hash, /^#[a-f0-9]{64}$/);
  const transferToken = handoff.hash.slice(1);
  assert.equal(counts("wallet_transactions"), 2, "A dedicated-domain win waits for a signed-in app account");
  assert.equal((await redeem(transferToken)).status, 401);
  assert.equal((await redeem(transferToken, { host: gameOrigin, cookie: transferred.cookie })).status, 403);
  const transfer = await redeem(transferToken, { cookie: transferred.cookie });
  assert.deepEqual(transfer.body, { reward });
  assert.equal(transfer.status, 200);
  assert.deepEqual((await redeem(transferToken, { cookie: transferred.cookie })).body, { reward });
  assert.equal((await redeem(transferToken, { cookie: other.cookie })).status, 409, "One win cannot credit a second account");
  assert.equal((await walletOverview(other.id)).balance, 0);
  assert.equal((await walletOverview(transferred.id)).balance, 100_000);
  assert.equal(counts("wallet_transactions"), 3);

  const priorRound = await start({ cookie: atLimit.cookie });
  const priorRoundCookie = combineCookies(atLimit.cookie, readCookie(priorRound));
  database.prepare("UPDATE squirrel_reward_sessions SET movement_version=2 WHERE id=?").run(priorRound.body.id);
  database.prepare("INSERT INTO wallets(user_id,balance,updated_at) VALUES(?,?,?)").run(atLimit.id, 9_900_000, now);
  now += 10_000;
  const priorClaim = await claim(claimInput({ ...priorRound.body, movementVersion: 2 }), { cookie: priorRoundCookie });
  assert.equal(priorClaim.status, 200, "An unfinished round still uses its stored movement version");
  assert.deepEqual(priorClaim.body, { reward: { ...reward, balanceAfter: 10_000_000 } });
  assert.equal((await walletOverview(atLimit.id)).balance, 10_000_000, "The exact balance cap permits a full award");

  now += 15 * 60_000 + 1;
  assert.equal((await redeem(transferToken, { cookie: transferred.cookie })).status, 410);
  const old = remaining[0].status === 409 ? {play: secondPlay, cookie: secondCookie} : {play: thirdPlay, cookie: thirdCookie};
  now = old.play.body.expiresAt + 1;
  assert.equal((await claim(claimInput(old.play.body), { cookie: old.cookie })).status, 410);

  delete process.env.SQUIRREL_REWARD_LIMIT;
  process.env.APP_ORIGIN = "https://stage.hmghadam.com";
  assert.equal((await start({ host: process.env.APP_ORIGIN, cookie: other.cookie })).status, 200);
  assert.equal((await start({ host: gameOrigin })).status, 409, "A cached game cannot mint a Stage win");
  assert.equal((await start({ host: process.env.APP_ORIGIN, origin: gameOrigin })).status, 403);
  process.env.APP_ORIGIN = appOrigin;
  const publicPlay = await start({ origin: gameOrigin, cookie: winner.cookie });
  assert.equal(publicPlay.status, 200);
  assert.equal(publicPlay.body.reward, undefined, "Public game never reads the main app account during play");
  now += 10_000;
  const publicClaim = await claim(claimInput(publicPlay.body), { origin: gameOrigin, cookie: readCookie(publicPlay) });
  assert.equal(publicClaim.status, 200);
  const receiver = new URL(publicClaim.body.continueHref);
  assert.equal(receiver.origin + receiver.pathname, appOrigin + rewardPath + "/receive");
  assert.equal((await redeem(receiver.hash.slice(1), { origin: gameOrigin, cookie: other.cookie })).status, 403);
  assert.equal((await redeem(receiver.hash.slice(1))).status, 401);
  assert.equal((await redeem(receiver.hash.slice(1), { cookie: other.cookie })).status, 200);
  assert.equal((await walletOverview(other.id)).balance, 100_000);
  process.env.SQUIRREL_REWARD_LIMIT = "0";
  assert.equal((await start({ host: process.env.APP_ORIGIN, cookie: other.cookie })).status, 503);
  console.log("PASS logged-in squirrel wallet credit, verified cross-domain handoff, replay, caps and expiry");
} finally {
  Date.now = realNow;
  globalThis.fetch = realFetch;
  database?.close();
  rmSync(scratch, { recursive: true, force: true });
}
