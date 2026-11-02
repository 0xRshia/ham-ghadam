"use client";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Wallet } from "lucide-react";
import { useResource } from "@/hooks/use-resource";
import { api } from "@/lib/client";
import { clock, date, fa, faDigits } from "@/lib/types";
import { parseCredits, walletAmountMessage } from "@/lib/wallet-input";
import {
  WALLET_MAX_BALANCE,
  WALLET_MIN_AMOUNT,
  WALLET_TOP_UP_PRESETS,
  walletRemainingCapacity,
  walletTransactionState,
  type WalletOverview,
  type WalletTransaction,
} from "@/lib/wallet-limits";
import { walletCopy as t } from "@/locales/wallet-fa";
import { AccountGate } from "./community";
import { Button, ErrorState, Header, LoadingState } from "./primitives";
import styles from "./wallet.module.css";

const outcomes = ["success", "cancelled", "pending", "review", "limit"] as const;
type Outcome = typeof outcomes[number];

export function WalletPage() {
  return <main className={styles.page}><Header title={t.title} back="/account" /><AccountGate><WalletContent /></AccountGate></main>;
}

function WalletContent() {
  const resource = useResource<WalletOverview>("/api/wallet");
  const outcome = useSearchParams().get("payment");
  if (resource.loading) return <LoadingState />;
  if (!resource.data) return <ErrorState message={resource.error} retry={resource.reload} />;
  const wallet = resource.data;
  return <div className={styles.content}>
    {outcomes.includes(outcome as Outcome) && <p className={styles.notice} data-tone={outcome === "success" ? "success" : outcome === "pending" ? "neutral" : "warning"} role="status">{t.results[outcome as Outcome]}</p>}
    <BalanceCard balance={wallet.balance} />
    <TopUpForm wallet={wallet} />
    <History wallet={wallet} onVerified={resource.reload} />
  </div>;
}

export function BalanceCard({ balance }: { balance: number }) {
  const remaining = walletRemainingCapacity(balance);
  return <section className={styles.balance} aria-label={t.balanceCaption}>
    <span className={styles.balanceIcon} aria-hidden="true"><Wallet size={24} /></span>
    <p>{t.balanceCaption}</p>
    <strong><bdi>{fa(balance)}</bdi> <span>{t.credits}</span></strong>
    <small>{remaining ? t.remaining(fa(remaining)) : t.full}</small>
  </section>;
}

function TopUpForm({ wallet }: { wallet: WalletOverview }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const remaining = walletRemainingCapacity(wallet.balance);
  const disabled = !wallet.topUpAvailable || remaining < WALLET_MIN_AMOUNT;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseCredits(value);
    const message = walletAmountMessage(amount, wallet.balance);
    setError(message);
    if (message) return;
    setBusy(true);
    try {
      const result = await api<{ url: string }>("/api/wallet/top-ups", { amount });
      window.location.assign(result.url);
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  }
  return <section className={styles.section} aria-labelledby="wallet-top-up">
    <h2 id="wallet-top-up">{t.topUp}</h2>
    {!wallet.topUpAvailable ? <p className={styles.muted}>{t.topUpUnavailable}</p> : remaining < WALLET_MIN_AMOUNT ? <p className={styles.muted}>{t.full}</p> :
      <form className={styles.form} onSubmit={submit} noValidate>
        <p className={styles.muted}>{t.topUpHint(fa(WALLET_MIN_AMOUNT), fa(Math.min(WALLET_MAX_BALANCE, remaining)))}</p>
        <div className={styles.presets} role="group" aria-label={t.presets}>
          {WALLET_TOP_UP_PRESETS.filter(preset => preset <= remaining).map(preset => <button type="button" key={preset} aria-pressed={parseCredits(value) === preset} onClick={() => { setValue(fa(preset)); setError(""); }}>{fa(preset)}</button>)}
        </div>
        <label className="el-input-field"><span>{t.amount}</span>
          <input inputMode="numeric" autoComplete="off" value={value} placeholder={t.amountPlaceholder} aria-invalid={!!error} aria-describedby={error ? "wallet-amount-error" : undefined}
            onChange={event => { setValue(event.target.value); setError(""); }} />
        </label>
        {error && <p id="wallet-amount-error" className={styles.error} role="alert">{error}</p>}
        <Button disabled={busy || disabled} aria-busy={busy}>{busy ? t.redirecting : t.pay}</Button>
      </form>}
  </section>;
}

function History({ wallet, onVerified }: { wallet: WalletOverview; onVerified: () => void }) {
  return <section className={styles.section} aria-labelledby="wallet-history">
    <h2 id="wallet-history">{t.history}</h2>
    {!wallet.transactions.length ? <p className={styles.muted}>{t.noHistory}</p> :
      <ul className={styles.history}>{wallet.transactions.map(item => <TransactionRow key={item.id} item={item} now={wallet.serverNow} onVerified={wallet.topUpAvailable ? onVerified : undefined} />)}</ul>}
  </section>;
}

export function TransactionRow({ item, now, onVerified }: { item: WalletTransaction; now: number; onVerified?: () => void }) {
  const state = walletTransactionState(item, now);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function verify() {
    setBusy(true); setError("");
    try { await api(`/api/wallet/top-ups/${encodeURIComponent(item.id)}/verify`, {}); onVerified?.(); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <li className={styles.row}>
    <div>
      <strong>{item.kind === "admin_grant" ? t.adminGrant : t.topUpEntry}</strong>
      {item.note && <p>{item.note}</p>}
      <small>{date(item.created_at)} · {clock(item.created_at)}</small>
      {item.balance_after !== null && <small>{t.balanceAfter(fa(item.balance_after))}</small>}
      {item.reference && <small>{t.reference("")}<bdi dir="ltr">{faDigits(item.reference)}</bdi></small>}
      {error && <small className={styles.error} role="alert">{error}</small>}
    </div>
    <div className={styles.rowAmount}>
      <strong data-state={state}><bdi dir="ltr">{state === "completed" ? "+" : ""}{fa(item.amount)}</bdi></strong>
      <span className={styles.badge} data-state={state}>{t.states[state]}</span>
      {onVerified && item.kind === "top_up" && state === "pending" && <button type="button" className="el-text-action" disabled={busy} aria-busy={busy} onClick={() => void verify()}>{t.verify}</button>}
    </div>
  </li>;
}
