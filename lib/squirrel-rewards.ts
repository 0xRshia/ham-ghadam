import { config, database } from "@/db";
import { ApiError, hash, randomToken, rateLimit } from "@/lib/server";
import { SQUIRREL_COUPON_TOMAN } from "./squirrel-coupon";
import { replaySquirrelRewardProof } from "./squirrel-reward-proof";
import { worldTiming } from "./squirrel-ar-game";

const cookieName = "hg_fandogh_reward";
const browserTokenPattern = /^[a-f0-9]{64}$/;
const sessionIdPattern = /^[a-f0-9-]{36}$/;
const sessionAge = 45 * 60_000;
const minPlayTime = worldTiming.waiting + worldTiming.entering;
const unavailable = "فعلاً امکان دریافت کوپن بازی وجود ندارد.";
const invalid = "این دور از بازی برای دریافت کوپن تأیید نشد.";
type RewardSession = { id: string; seed: number; issued_at: number; expires_at: number };

function campaignLimit() {
  const env = config();
  if (env.SQUIRREL_REWARD_LIMIT !== undefined) {
    const limit = Number(env.SQUIRREL_REWARD_LIMIT);
    return Number.isSafeInteger(limit) && limit > 0 ? limit : 0;
  }
  return env.APP_ORIGIN?.replace(/\/$/, "") === "https://stage.hmghadam.com" ? 1000 : 0;
}

function browserToken(req: Request) {
  const token = req.headers.get("cookie")?.split(";").map(value => value.trim())
    .find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return token && browserTokenPattern.test(token) ? token : undefined;
}

function couponFor(req: Request, code: string) {
  const redeemHref = new URL(req.url).hostname === "game.hmghadam.com" ? "https://app.hmghadam.com/events" : "/events";
  return { code, amountToman: SQUIRREL_COUPON_TOMAN, redeemHref };
}

async function findCoupon(browserHash: string) {
  return database().prepare("SELECT code FROM squirrel_reward_coupons WHERE browser_hash=?").bind(browserHash).first<{code: string}>();
}

export function squirrelRewardCookie(req: Request, token: string) {
  const secure = new URL(req.url).protocol === "https:" || config().APP_ORIGIN?.startsWith("https://");
  return `${cookieName}=${token}; Path=/game/reward; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? "; Secure" : ""}`;
}

export async function startSquirrelReward(req: Request) {
  const limit = campaignLimit();
  if (!limit) throw new ApiError(503, unavailable);
  const token = browserToken(req) ?? randomToken();
  const browserHash = await hash(token);
  const now = Date.now();
  const db = database();
  const existing = await findCoupon(browserHash);
  let session = await db.prepare("SELECT id,seed,issued_at,expires_at FROM squirrel_reward_sessions WHERE browser_hash=? AND expires_at>? ORDER BY expires_at DESC LIMIT 1")
    .bind(browserHash, now + 30_000).first<RewardSession>();
  if (!session) {
    await rateLimit(`squirrel-reward-ip:${await hash(req.headers.get("cf-connecting-ip") ?? "local")}`, 250);
    session = await db.prepare(`INSERT INTO squirrel_reward_sessions(id,browser_hash,seed,issued_at,expires_at)
      VALUES(?,?,?,?,?) RETURNING id,seed,issued_at,expires_at`)
      .bind(crypto.randomUUID(), browserHash, crypto.getRandomValues(new Uint32Array(1))[0], now, now + sessionAge).first<RewardSession>();
  }
  if (!session) throw new ApiError(503, unavailable);
  return { token, session: { id: session.id, seed: session.seed, expiresAt: session.expires_at, ...(existing ? { coupon: couponFor(req, existing.code) } : {}) } };
}

export async function claimSquirrelReward(req: Request, data: Record<string, unknown>) {
  const limit = campaignLimit();
  if (!limit) throw new ApiError(503, unavailable);
  const token = browserToken(req);
  if (!token || typeof data.sessionId !== "string" || !sessionIdPattern.test(data.sessionId)) throw new ApiError(400, invalid);
  const browserHash = await hash(token);
  const existing = await findCoupon(browserHash);
  if (existing) return couponFor(req, existing.code);
  await rateLimit(`squirrel-reward-claim:${browserHash}`, 40);

  const now = Date.now();
  const db = database();
  const session = await db.prepare("SELECT id,seed,issued_at,expires_at FROM squirrel_reward_sessions WHERE id=? AND browser_hash=? AND expires_at>?")
    .bind(data.sessionId, browserHash, now).first<RewardSession>();
  if (!session) throw new ApiError(410, "مهلت این دور تمام شده است. بازی را دوباره شروع کنید.");
  if (!replaySquirrelRewardProof(session.seed, data.proof)) throw new ApiError(400, invalid);
  const { encounterMs, launchMs, impactMs } = data.proof;
  if (now - session.issued_at < minPlayTime + encounterMs + launchMs + impactMs) throw new ApiError(400, invalid);

  const code = `FND-${randomToken().slice(0, 24).toUpperCase()}`;
  const issued = await db.prepare(`INSERT INTO squirrel_reward_coupons(code,browser_hash,session_id,issued_at)
    SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM squirrel_reward_coupons)<?
    ON CONFLICT(browser_hash) DO NOTHING RETURNING code`).bind(code, browserHash, session.id, now, limit).first<{code: string}>();
  const coupon = issued ?? await findCoupon(browserHash);
  if (!coupon) throw new ApiError(409, "ظرفیت کوپن‌های این دوره تکمیل شده است.");
  return couponFor(req, coupon.code);
}
