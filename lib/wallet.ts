import { config, database } from "@/db";
import { ApiError, paymentReady, rateLimit } from "@/lib/server";
import { zarinpalRequest, type ProviderResponse } from "@/lib/payments";
import { fa } from "@/lib/types";
import {
  WALLET_MAX_BALANCE,
  WALLET_MIN_AMOUNT,
  walletAmountError,
  walletRemainingCapacity,
  type WalletOverview,
  type WalletTransaction,
} from "@/lib/wallet-limits";
import { walletCopy } from "@/locales/wallet-fa";

type StoredWalletTransaction = WalletTransaction & {
  user_id: string;
  authority: string | null;
  payment_state: string | null;
};

export type TopUpOutcome = "success" | "cancelled" | "pending" | "review" | "limit";

const transactionColumns = "id,kind,amount,status,balance_after,note,reference,created_at,completed_at";

export async function walletBalance(userId: string) {
  const row = await database().prepare("SELECT balance FROM wallets WHERE user_id=?").bind(userId).first<{ balance: number }>();
  return Number(row?.balance ?? 0);
}

export async function walletOverview(userId: string, limit = 20): Promise<WalletOverview> {
  const [balance, history] = await Promise.all([
    walletBalance(userId),
    database().prepare(`SELECT ${transactionColumns} FROM wallet_transactions WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT ?`)
      .bind(userId, limit).all<WalletTransaction>(),
  ]);
  return {
    balance,
    minAmount: WALLET_MIN_AMOUNT,
    maxBalance: WALLET_MAX_BALANCE,
    topUpAvailable: paymentReady(),
    transactions: history.results,
    serverNow: Date.now(),
  };
}

export function assertWalletAmount(amount: unknown, balance: number): asserts amount is number {
  const error = walletAmountError(amount, balance);
  if (!error) return;
  if (error === "cap") throw new ApiError(409, walletCopy.errors.cap(fa(walletRemainingCapacity(balance))));
  if (error === "below") throw new ApiError(400, walletCopy.errors.below(fa(WALLET_MIN_AMOUNT)));
  if (error === "above") throw new ApiError(400, walletCopy.errors.above(fa(WALLET_MAX_BALANCE)));
  throw new ApiError(400, walletCopy.errors.invalid);
}

export function walletNote(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.trim().length > 200 || /[\u0000-\u001f\u007f]/.test(value))
    throw new ApiError(400, walletCopy.errors.noteInvalid);
  return value.trim();
}

/**
 * Credits a wallet in one transaction. The CHECK constraint on wallets.balance
 * rolls the whole batch back if a concurrent credit already used the capacity.
 */
export async function grantCredits(userId: string, amount: unknown, note: string) {
  assertWalletAmount(amount, await walletBalance(userId));
  const db = database();
  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await db.batch([
      db.prepare("INSERT INTO wallets(user_id,balance,updated_at) VALUES(?,0,?) ON CONFLICT(user_id) DO NOTHING").bind(userId, now),
      db.prepare("UPDATE wallets SET balance=balance+?,updated_at=? WHERE user_id=?").bind(amount, now, userId),
      db.prepare(`INSERT INTO wallet_transactions(id,user_id,kind,amount,status,balance_after,note,created_at,completed_at)
        VALUES(?,?,'admin_grant',?,'completed',(SELECT balance FROM wallets WHERE user_id=?),?,?,?)`)
        .bind(id, userId, amount, userId, note, now, now),
    ]);
  } catch (error) {
    assertWalletAmount(amount, await walletBalance(userId));
    throw error;
  }
  return await database().prepare(`SELECT ${transactionColumns} FROM wallet_transactions WHERE id=?`).bind(id).first<WalletTransaction>();
}

export async function startTopUp(user: { id: string; phone: string }, amount: unknown) {
  if (!paymentReady()) throw new ApiError(503, walletCopy.topUpUnavailable);
  assertWalletAmount(amount, await walletBalance(user.id));
  await rateLimit(`wallet-top-up:${user.id}`, 10, 5000);
  const db = database();
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO wallet_transactions(id,user_id,kind,amount,status,payment_state,created_at) VALUES(?,?,'top_up',?,'pending','requesting',?)")
    .bind(id, user.id, amount, Date.now()).run();
  let result: ProviderResponse;
  try {
    result = await zarinpalRequest("request", {
      amount: amount * 10,
      currency: "IRR",
      description: walletCopy.errors.paymentDescription(fa(amount)),
      callback_url: `${config().APP_ORIGIN!.replace(/\/$/, "")}/api/wallet/callback`,
      metadata: { mobile: user.phone, order_id: id, auto_verify: false },
    });
  } catch {
    await db.prepare("UPDATE wallet_transactions SET status='failed',payment_state='request_unknown' WHERE id=? AND status='pending'").bind(id).run();
    throw new ApiError(503, walletCopy.results.pending);
  }
  const authority = result.data?.code === 100 ? result.data.authority : undefined;
  if (!authority || !/^[a-zA-Z0-9_-]{8,100}$/.test(authority)) {
    await db.prepare("UPDATE wallet_transactions SET status='failed',payment_state='request_failed' WHERE id=? AND status='pending'").bind(id).run();
    throw new ApiError(502, walletCopy.topUpUnavailable);
  }
  await db.prepare("UPDATE wallet_transactions SET authority=?,payment_state='pending' WHERE id=? AND status='pending'").bind(authority, id).run();
  return { id, url: `https://payment.zarinpal.com/pg/StartPay/${encodeURIComponent(authority)}` };
}

export function findTopUp(where: { authority: string } | { id: string; userId: string }) {
  const statement = "authority" in where
    ? database().prepare("SELECT * FROM wallet_transactions WHERE kind='top_up' AND authority=?").bind(where.authority)
    : database().prepare("SELECT * FROM wallet_transactions WHERE kind='top_up' AND id=? AND user_id=?").bind(where.id, where.userId);
  return statement.first<StoredWalletTransaction>();
}

const markTopUp = (id: string, status: string, paymentState: string) =>
  database().prepare("UPDATE wallet_transactions SET status=?,payment_state=? WHERE id=? AND status='pending'").bind(status, paymentState, id).run();

/**
 * Verifies a returned top-up and credits it exactly once. The cap is checked
 * before verification: Zarinpal reverses payments that are never verified, so
 * an over-cap top-up is refused without taking the user's money.
 */
export async function completeTopUp(transaction: StoredWalletTransaction, gatewayAccepted: boolean): Promise<TopUpOutcome> {
  if (transaction.status === "completed") return "success";
  if (transaction.status === "paid_unfulfilled") return "review";
  if (transaction.status !== "pending" || !transaction.authority) return "cancelled";
  if (!gatewayAccepted) {
    await markTopUp(transaction.id, "cancelled", "cancelled");
    return "cancelled";
  }
  if (walletAmountError(transaction.amount, await walletBalance(transaction.user_id))) {
    await markTopUp(transaction.id, "failed", "limit_exceeded");
    return "limit";
  }
  if (!paymentReady()) return "pending";
  await rateLimit(`verify-authority:${transaction.authority}`, 60, 20000);
  let result: ProviderResponse;
  try {
    result = await zarinpalRequest("verify", { amount: transaction.amount * 10, authority: transaction.authority });
  } catch {
    await database().prepare("UPDATE wallet_transactions SET payment_state='verification_pending' WHERE id=? AND status='pending'").bind(transaction.id).run();
    return "pending";
  }
  const code = result.data?.code;
  if (code !== 100 && code !== 101) {
    const error = !Array.isArray(result.errors) ? result.errors?.code : undefined;
    if (error === -51) {
      await markTopUp(transaction.id, "failed", "not_verified");
      return "cancelled";
    }
    await database().prepare("UPDATE wallet_transactions SET payment_state='verification_pending' WHERE id=? AND status='pending'").bind(transaction.id).run();
    return "pending";
  }
  const reference = String(result.data?.ref_id ?? "");
  const db = database();
  const now = Date.now();
  try {
    // Both statements are guarded by status='pending', so a repeated callback
    // or a concurrent status check cannot credit the same payment twice.
    await db.batch([
      db.prepare("INSERT INTO wallets(user_id,balance,updated_at) VALUES(?,0,?) ON CONFLICT(user_id) DO NOTHING").bind(transaction.user_id, now),
      db.prepare("UPDATE wallets SET balance=balance+?,updated_at=? WHERE user_id=? AND EXISTS(SELECT 1 FROM wallet_transactions WHERE id=? AND status='pending')")
        .bind(transaction.amount, now, transaction.user_id, transaction.id),
      db.prepare("UPDATE wallet_transactions SET status='completed',payment_state='paid',reference=?,balance_after=(SELECT balance FROM wallets WHERE user_id=?),completed_at=? WHERE id=? AND status='pending'")
        .bind(reference, transaction.user_id, now, transaction.id),
    ]);
  } catch (error) {
    // Verified money that could not be credited (a concurrent grant filled the
    // cap) is kept for support follow-up instead of being silently dropped.
    console.error("Wallet credit failed after verified payment", { transaction: transaction.id, error: error instanceof Error ? error.name : "Unknown" });
    await db.prepare("UPDATE wallet_transactions SET status='paid_unfulfilled',payment_state='paid',reference=? WHERE id=? AND status='pending'")
      .bind(reference, transaction.id).run();
    return "review";
  }
  const final = await db.prepare("SELECT status FROM wallet_transactions WHERE id=?").bind(transaction.id).first<{ status: string }>();
  return final?.status === "completed" ? "success" : final?.status === "paid_unfulfilled" ? "review" : "pending";
}

export async function userByPhone(phone: string) {
  return database().prepare("SELECT id,name,phone FROM users WHERE phone=?").bind(phone).first<{ id: string; name: string; phone: string }>();
}
