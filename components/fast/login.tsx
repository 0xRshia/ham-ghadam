"use client";
import { useState } from "react";
import { useAppNavigate } from "@/components/event/app-navigation";
import { LockKeyhole } from "lucide-react";
import { api } from "@/lib/client";
import { fastCopy as t } from "@/locales/fast-fa";
import styles from "./fast.module.css";

export function FastLogin({ configured }: { configured: boolean }) {
  const navigate = useAppNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <section className={`${styles.card} ${styles.login}`}>
    <LockKeyhole size={32} /><h1>{t.login}</h1><p className={styles.muted}>{t.loginHint}</p>
    {!configured ? <p className={styles.notice} role="status">{t.notConfigured}</p> : <form className={styles.grid} onSubmit={async event => {
      event.preventDefault(); if (busy) return;
      const data = new FormData(event.currentTarget);
      setBusy(true); setError("");
      try { await api("/api/fast/session", { username: data.get("username"), password: data.get("password") }); navigate("/fast", { replace: true }); }
      catch (error) { setError((error as Error).message); setBusy(false); }
    }}>
      <label className={`${styles.field} ${styles.wide}`}>{t.username}<input name="username" required autoComplete="username" dir="ltr" maxLength={100} disabled={busy} /></label>
      <label className={`${styles.field} ${styles.wide}`}>{t.password}<input name="password" type="password" required autoComplete="current-password" maxLength={512} dir="ltr" disabled={busy} /></label>
      {error && <p className={`${styles.error} ${styles.wide}`} role="alert">{error}</p>}
      <button className={`button ${styles.wide}`} disabled={busy}>{busy ? t.saving : t.signIn}</button>
    </form>}
  </section>;
}
