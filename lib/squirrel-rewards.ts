import { config, database } from "@/db";
import { ApiError, hash, randomToken, rateLimit, requireUser } from "@/lib/server";
import { replaySquirrelRewardProof } from "./squirrel-reward-proof";
import { squirrelAccountOrigin, squirrelGameOrigin, squirrelRewardReceivePath } from "./squirrel-reward-receive";
import { currentWorldMovementVersion, squirrelMovementVersionHeader, worldTiming, type WorldMovementVersion } from "./squirrel-ar-game";
import { SQUIRREL_REWARD_TOMAN, squirrelRewardCreditHeader, squirrelRewardCreditMode, type SquirrelRewardCredit } from "./squirrel-reward-credit";
import { publicSquirrelPlayRequest } from "./squirrel-play-request";
import { walletBalance } from "./wallet";
import { WALLET_MAX_BALANCE } from "./wallet-limits";

const cookieName = "hg_fandogh_reward";
const tokenPattern = /^[a-f0-9]{64}$/;
const sessionIdPattern = /^[a-f0-9-]{36}$/;
const sessionAge = 45 * 60_000;
const handoffAge = 15 * 60_000;
const minPlayTime = worldTiming.waiting + worldTiming.entering;
const unavailable = "فعلاً امکان دریافت اعتبار بازی وجود ندارد.";
const invalid = "این دور از بازی برای دریافت اعتبار تأیید نشد.";
const expired = "مهلت دریافت اعتبار این دور تمام شده است.";
const refreshRequired = "برای شروع دور تازهٔ جایزه، صفحهٔ بازی را تازه کنید.";
const alreadyUsed = "اعتبار این برد قبلاً دریافت شده است.";
type RewardSession = { id: string; seed: number; issued_at: number; expires_at: number; movement_version: WorldMovementVersion };
type RewardTransaction = { amount: number; balance_after: number };

const sessionColumns = "id,seed,issued_at,expires_at,movement_version";

function campaignLimit() {
  const env = config();
  if (env.SQUIRREL_REWARD_LIMIT !== undefined) {
    const limit = Number(env.SQUIRREL_REWARD_LIMIT);
    return Number.isSafeInteger(limit) && limit > 0 ? limit : 0;
  }
  const origin = env.APP_ORIGIN?.replace(/\/$/, "");
  return origin && [squirrelAccountOrigin, "https://hmghadam.com", "https://stage.hmghadam.com"].includes(origin) ? 1000 : 0;
}

function dedicatedGame(req: Request) {
  return new URL(req.url).origin === squirrelGameOrigin || publicSquirrelPlayRequest(req);
}

function playerAccount(req: Request) {
  if (!dedicatedGame(req)) return requireUser(req);
  // Cached clients must refresh before starting a public win on the old Stage backend.
  if (config().APP_ORIGIN?.replace(/\/$/, "") === "https://stage.hmghadam.com") {
    throw new ApiError(409, refreshRequired);
  }
  return null;
}

function browserToken(req: Request) {
  const token = req.headers.get("cookie")?.split(";").map(value => value.trim())
    .find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return token && tokenPattern.test(token) ? token : undefined;
}

function credit(transaction: RewardTransaction): SquirrelRewardCredit {
  return { amountToman: transaction.amount, balanceAfter: transaction.balance_after, walletHref: "/wallet" };
}

function findUserReward(userId: string) {
  return database().prepare(`SELECT award.amount+COALESCE(adjustment.amount,0) AS amount,
    COALESCE(adjustment.balance_after,award.balance_after) AS balance_after
    FROM wallet_transactions AS award
    LEFT JOIN wallet_transactions AS adjustment ON adjustment.user_id=award.user_id AND adjustment.kind='game_reward_adjustment'
    WHERE award.kind='game_reward' AND award.user_id=?`)
    .bind(userId).first<RewardTransaction>();
}

export function squirrelRewardCookie(req: Request, token: string) {
  const secure = new URL(req.url).protocol === "https:" || config().APP_ORIGIN?.startsWith("https://");
  return `${cookieName}=${token}; Path=/game/reward; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? "; Secure" : ""}`;
}

export async function startSquirrelReward(req: Request) {
  if (!campaignLimit()) throw new ApiError(503, unavailable);
  if (req.headers.get(squirrelRewardCreditHeader) !== squirrelRewardCreditMode
    || req.headers.get(squirrelMovementVersionHeader) !== String(currentWorldMovementVersion)) {
    throw new ApiError(409, refreshRequired);
  }
  const user = await playerAccount(req);
  const userId = user?.id ?? null;
  const token = browserToken(req) ?? randomToken();
  const browserHash = await hash(token);
  const now = Date.now();
  const db = database();
  const existing = user ? await findUserReward(user.id) : null;
  let session = await db.prepare(`SELECT ${sessionColumns} FROM squirrel_reward_sessions
    WHERE browser_hash=? AND user_id IS ? AND reward_mode='wallet' AND movement_version=? AND expires_at>?
    ORDER BY expires_at DESC LIMIT 1`)
    .bind(browserHash, userId, currentWorldMovementVersion, now + 30_000).first<RewardSession>();
  if (!session) {
    await rateLimit(`squirrel-reward-ip:${await hash(req.headers.get("cf-connecting-ip") ?? "local")}`, 250);
    session = await db.prepare(`INSERT INTO squirrel_reward_sessions
      (id,browser_hash,seed,issued_at,expires_at,movement_version,user_id,reward_mode)
      VALUES(?,?,?,?,?,?,?,'wallet') RETURNING ${sessionColumns}`)
      .bind(crypto.randomUUID(), browserHash, crypto.getRandomValues(new Uint32Array(1))[0], now, now + sessionAge,
        currentWorldMovementVersion, userId).first<RewardSession>();
  }
  if (!session) throw new ApiError(503, unavailable);
  return { token, session: { id: session.id, seed: session.seed, expiresAt: session.expires_at, movementVersion: session.movement_version,
    ...(existing ? { reward: credit(existing) } : {}) } };
}

async function awardWalletCredit(userId: string, sessionId: string, handoffHash: string | null = null) {
  const limit = campaignLimit();
  if (!limit) throw new ApiError(503, unavailable);
  const db = database();
  const now = Date.now();
  const transactionId = crypto.randomUUID();
  // The ledger claim, balance cap and campaign slot are decided in the same
  // write transaction. Only this batch's new ledger row can change the balance.
  await db.batch([
    db.prepare(`INSERT INTO wallet_transactions(id,user_id,kind,amount,status,balance_after,created_at,completed_at,game_session_id)
      SELECT ?1,?2,'game_reward',?3,'completed',COALESCE((SELECT balance FROM wallets WHERE user_id=?2),0)+?3,?4,?4,?5
      WHERE COALESCE((SELECT balance FROM wallets WHERE user_id=?2),0)+?3<=?6
        AND (SELECT COUNT(*) FROM wallet_transactions WHERE kind='game_reward')<?7
        AND EXISTS(SELECT 1 FROM squirrel_reward_sessions
          WHERE id=?5 AND reward_mode='wallet' AND expires_at>?4
            AND ((?8 IS NULL AND user_id=?2) OR (user_id IS NULL AND handoff_hash=?8 AND handoff_expires_at>?4)))
      ON CONFLICT DO NOTHING`)
      .bind(transactionId, userId, SQUIRREL_REWARD_TOMAN, now, sessionId, WALLET_MAX_BALANCE, limit, handoffHash),
    db.prepare(`INSERT INTO wallets(user_id,balance,updated_at)
      SELECT user_id,amount,created_at FROM wallet_transactions WHERE id=? AND kind='game_reward'
      ON CONFLICT(user_id) DO UPDATE SET balance=wallets.balance+excluded.balance,updated_at=excluded.updated_at`)
      .bind(transactionId),
  ]);
  const existing = await findUserReward(userId);
  if (existing) return { reward: credit(existing) };
  if (await db.prepare("SELECT 1 FROM wallet_transactions WHERE game_session_id=?").bind(sessionId).first()) {
    throw new ApiError(409, alreadyUsed);
  }
  if (await walletBalance(userId) + SQUIRREL_REWARD_TOMAN > WALLET_MAX_BALANCE) {
    throw new ApiError(409, "این جایزه از سقف موجودی کیف پول بیشتر می‌شود.");
  }
  throw new ApiError(409, "ظرفیت جایزهٔ این دوره تکمیل شده یا مهلت دریافت این برد تمام شده است.");
}

export async function claimSquirrelReward(req: Request, data: Record<string, unknown>) {
  if (!campaignLimit()) throw new ApiError(503, unavailable);
  const user = await playerAccount(req);
  const token = browserToken(req);
  if (!token || typeof data.sessionId !== "string" || !sessionIdPattern.test(data.sessionId)) throw new ApiError(400, invalid);
  const browserHash = await hash(token);
  const db = database();
  const now = Date.now();
  const session = await db.prepare(`SELECT ${sessionColumns} FROM squirrel_reward_sessions
    WHERE id=? AND browser_hash=? AND user_id IS ? AND reward_mode='wallet' AND expires_at>?`)
    .bind(data.sessionId, browserHash, user?.id ?? null, now).first<RewardSession>();
  if (!session) throw new ApiError(410, expired);
  const existing = user ? await findUserReward(user.id) : null;
  if (existing) return { reward: credit(existing) };
  await rateLimit(`squirrel-reward-claim:${browserHash}`, 40);
  if (!replaySquirrelRewardProof(session.seed, data.proof, session.movement_version)) throw new ApiError(400, invalid);
  const { encounterMs, launchMs, impactMs } = data.proof;
  if (now - session.issued_at < minPlayTime + encounterMs + launchMs + impactMs) throw new ApiError(400, invalid);
  if (user) return awardWalletCredit(user.id, session.id);

  const handoff = randomToken();
  const saved = await db.prepare(`UPDATE squirrel_reward_sessions SET handoff_hash=?,handoff_expires_at=? WHERE id=?
    AND NOT EXISTS(SELECT 1 FROM wallet_transactions WHERE game_session_id=?) RETURNING id`)
    .bind(await hash(handoff), Math.min(session.expires_at, now + handoffAge), session.id, session.id).first();
  if (!saved) throw new ApiError(409, alreadyUsed);
  return { continueHref: `${squirrelAccountOrigin}${squirrelRewardReceivePath}#${handoff}` };
}

export async function redeemSquirrelReward(req: Request, token: unknown) {
  if (dedicatedGame(req)) throw new ApiError(403, unavailable);
  const user = await requireUser(req);
  if (typeof token !== "string" || !tokenPattern.test(token)) throw new ApiError(400, invalid);
  const handoffHash = await hash(token);
  const now = Date.now();
  const session = await database().prepare(`SELECT id FROM squirrel_reward_sessions
    WHERE handoff_hash=? AND reward_mode='wallet' AND user_id IS NULL AND handoff_expires_at>? AND expires_at>?`)
    .bind(handoffHash, now, now).first<{ id: string }>();
  if (!session) throw new ApiError(410, expired);
  await rateLimit(`squirrel-reward-redeem:${user.id}`, 40);
  return awardWalletCredit(user.id, session.id, handoffHash);
}
