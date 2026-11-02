import { digits, fa } from "@/lib/types";
import { WALLET_MAX_BALANCE, WALLET_MIN_AMOUNT, walletAmountError, walletRemainingCapacity } from "@/lib/wallet-limits";
import { walletCopy } from "@/locales/wallet-fa";

/** Parses typed credits, accepting Persian/Arabic digits and thousands separators. */
export function parseCredits(value: string) {
  const normalized = digits(value).replace(/[\s,٬،]/g, "");
  return /^\d{1,9}$/.test(normalized) ? Number(normalized) : NaN;
}

export function walletAmountMessage(amount: number, balance: number) {
  const error = walletAmountError(amount, balance);
  if (error === "below") return walletCopy.errors.below(fa(WALLET_MIN_AMOUNT));
  if (error === "above") return walletCopy.errors.above(fa(WALLET_MAX_BALANCE));
  if (error === "cap") return walletCopy.errors.cap(fa(walletRemainingCapacity(balance)));
  return error ? walletCopy.errors.invalid : "";
}
