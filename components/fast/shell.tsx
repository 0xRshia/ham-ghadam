"use client";
import { useState, type ReactNode } from "react";
import { CalendarDays, LogOut } from "lucide-react";
import { AppLink, useAppNavigate } from "@/components/event/app-navigation";
import { ThemeMenu } from "@/components/event/theme-menu";
import { api } from "@/lib/client";
import { fastCopy as t } from "@/locales/fast-fa";
import styles from "./fast.module.css";

export function FastShell({ children, login = false }: { children: ReactNode; login?: boolean }) {
  const navigate = useAppNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true); setError("");
    try { await api("/api/fast/session", {}, "DELETE"); navigate("/fast/login", { replace: true }); }
    catch (error) { setError((error as Error).message); setBusy(false); }
  }
  return <div className={styles.shell}>
    <header className={styles.header}><div className={styles.headerInner}>
      <AppLink href={login ? "/" : "/fast"} className={styles.brand}><CalendarDays size={24} />هم‌قدم <span>· {t.title}</span></AppLink>
      <div className={styles.actions}><ThemeMenu />{!login && <button className="button outline" disabled={busy} onClick={() => void logout()}><LogOut size={16} />{t.signOut}</button>}</div>
    </div></header>
    <main className={styles.content}>{error && <p className={styles.error} role="alert">{error}</p>}{children}</main>
  </div>;
}
