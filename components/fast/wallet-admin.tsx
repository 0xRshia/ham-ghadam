"use client";
import { useState, type FormEvent } from "react";
import { Search, WalletCards } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { parseCredits, walletAmountMessage } from "@/lib/wallet-input";
import { api, ClientError } from "@/lib/client";
import { clock, date, fa, faDigits } from "@/lib/types";
import { walletRemainingCapacity, walletTransactionState, type WalletOverview } from "@/lib/wallet-limits";
import { fastCopy } from "@/locales/fast-fa";
import { walletCopy } from "@/locales/wallet-fa";
import styles from "./fast.module.css";

const t = walletCopy.fast;
type Lookup = { user: { id: string; name: string; phone: string }; wallet: WalletOverview };

export function FastWalletAdmin() {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<Lookup | null>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const fail = (failure: unknown) => setError({ message: (failure as Error).message, status: failure instanceof ClientError ? failure.status : undefined });

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(null); setSuccess(""); setResult(null);
    try { setResult(await api<Lookup>(`/api/fast/wallet?${new URLSearchParams({ phone })}`)); }
    catch (failure) { fail(failure); }
    finally { setBusy(false); }
  }

  async function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!result) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const amount = parseCredits(String(data.get("amount") ?? ""));
    const message = walletAmountMessage(amount, result.wallet.balance);
    setSuccess("");
    if (message) { setError({ message }); return; }
    if (!window.confirm(t.confirm(fa(amount), faDigits(result.user.phone)))) return;
    setBusy(true); setError(null);
    try {
      const updated = await api<Lookup>("/api/fast/wallet", { phone: result.user.phone, amount, note: String(data.get("note") ?? "") });
      setResult(updated); setSuccess(t.granted(fa(amount))); form.reset();
    } catch (failure) { fail(failure); }
    finally { setBusy(false); }
  }

  const remaining = result ? walletRemainingCapacity(result.wallet.balance) : 0;
  return <>
    <div className={styles.heading}><div><h1>{t.title}</h1><p>{t.lookupHint}</p></div><AppLink className="button outline" href="/fast">{t.back}</AppLink></div>
    <form className={`${styles.card} ${styles.filters}`} onSubmit={lookup}>
      <label className={styles.field}>{t.phone}<input name="phone" value={phone} onChange={event => setPhone(event.target.value)} required inputMode="tel" autoComplete="off" dir="ltr" maxLength={20} disabled={busy} /></label>
      <button className="button outline" disabled={busy || !phone.trim()}><Search size={16} />{t.lookup}</button>
    </form>
    {error && <div className={styles.error} role="alert">{error.message} {error.status === 401 && <AppLink href="/fast/login">{fastCopy.signIn}</AppLink>}</div>}
    {success && <p className={styles.success} role="status">{success}</p>}
    {result && <>
      <section className={styles.card} aria-labelledby="wallet-user">
        <h2 id="wallet-user"><WalletCards size={20} /> {result.user.name || t.unnamed} · <bdi dir="ltr">{faDigits(result.user.phone)}</bdi></h2>
        <p><strong>{walletCopy.balance}: {fa(result.wallet.balance)} {walletCopy.credits}</strong></p>
        <p className={styles.muted}>{remaining ? walletCopy.remaining(fa(remaining)) : walletCopy.full} {walletCopy.capacity(fa(result.wallet.maxBalance))}</p>
      </section>
      <form className={`${styles.card} ${styles.grid}`} onSubmit={grant}>
        <h2 className={styles.wide}>{t.grant}</h2>
        <label className={styles.field}>{walletCopy.amount}<input name="amount" required inputMode="numeric" autoComplete="off" placeholder={walletCopy.amountPlaceholder} disabled={busy || remaining < result.wallet.minAmount} /></label>
        <label className={styles.field}>{t.note}<input name="note" maxLength={200} placeholder={t.notePlaceholder} disabled={busy} /></label>
        <button className={`button ${styles.wide}`} disabled={busy || remaining < result.wallet.minAmount}>{t.submit}</button>
      </form>
      <section className={styles.card} aria-labelledby="wallet-history">
        <h2 id="wallet-history">{walletCopy.history}</h2>
        {!result.wallet.transactions.length && <p className={styles.muted}>{walletCopy.noHistory}</p>}
        {result.wallet.transactions.map(item => <article className={styles.row} key={item.id}>
          <div><h2>{item.kind === "admin_grant" ? walletCopy.adminGrant : walletCopy.topUpEntry}</h2><p>{date(item.created_at)} · {clock(item.created_at)}{item.note && ` · ${item.note}`}{item.reference && ` · ${walletCopy.reference(faDigits(item.reference))}`}</p></div>
          <div className={styles.actions}><strong>{fa(item.amount)}</strong><span className={styles.badge}>{walletCopy.states[walletTransactionState(item, result.wallet.serverNow)]}</span></div>
        </article>)}
      </section>
    </>}
  </>;
}
