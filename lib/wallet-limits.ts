// Client-safe wallet rules shared by the API, the wallet page and /fast.
// One credit equals one toman; Zarinpal receives amount × 10 rial.
export const WALLET_MIN_AMOUNT = 1_000;
export const WALLET_MAX_BALANCE = 10_000_000;
export const WALLET_TOP_UP_PRESETS = [50_000, 100_000, 500_000, 1_000_000] as const;
// Zarinpal reverses payments that are never verified; after this window an
// unfinished top-up is shown as not completed instead of awaiting payment.
export const WALLET_PENDING_WINDOW_MS = 30 * 60_000;

export type WalletTransactionKind = "admin_grant" | "top_up";
export type WalletTransactionStatus = "pending" | "completed" | "failed" | "cancelled" | "paid_unfulfilled";

export type WalletTransaction = {
  id: string;
  kind: WalletTransactionKind;
  amount: number;
  status: WalletTransactionStatus;
  balance_after: number | null;
  note: string;
  reference: string | null;
  created_at: number;
  completed_at: number | null;
};

export type WalletOverview = {
  balance: number;
  minAmount: number;
  maxBalance: number;
  topUpAvailable: boolean;
  transactions: WalletTransaction[];
  serverNow: number;
};

export type WalletAmountError = "invalid" | "below" | "above" | "cap";

/** Validates one credit transaction against the per-transaction range and the balance cap. */
export function walletAmountError(amount: unknown, balance: number): WalletAmountError | null {
  if (typeof amount !== "number" || !Number.isSafeInteger(amount)) return "invalid";
  if (amount < WALLET_MIN_AMOUNT) return "below";
  if (amount > WALLET_MAX_BALANCE) return "above";
  if (balance + amount > WALLET_MAX_BALANCE) return "cap";
  return null;
}

export function walletRemainingCapacity(balance: number) {
  return Math.max(0, WALLET_MAX_BALANCE - balance);
}

export type WalletDisplayState = "completed" | "pending" | "expired" | "failed" | "cancelled" | "review";

export function walletTransactionState(transaction: Pick<WalletTransaction, "status" | "created_at">, now: number): WalletDisplayState {
  if (transaction.status === "pending") return now - transaction.created_at < WALLET_PENDING_WINDOW_MS ? "pending" : "expired";
  if (transaction.status === "paid_unfulfilled") return "review";
  return transaction.status;
}
