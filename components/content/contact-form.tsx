"use client";

import { faContent } from "@/locales/domain-fa";
import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { api, ClientError } from "@/lib/client";
import { ButtonLabel } from "@/components/ui/button-label";
import styles from "./site-pages.module.css";

export function ContactForm() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const change = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/contact", form);
      setSent(true);
    } catch (cause) {
      setError(cause instanceof ClientError ? cause.message : faContent.contactSendFailed);
    } finally {
      setBusy(false);
    }
  }
  if (sent) return <div className={styles.sentState} role="status"><CheckCircle2 size={32} /><h2>{faContent.messageRecorded}</h2><p>{faContent.messageRecordedHint}</p><button type="button" className="button outline" onClick={() => { setSent(false); setForm({ name: "", email: "", phone: "", subject: "", message: "" }); }}>{faContent.sendAnotherMessage}</button></div>;
  return <form className={styles.contactForm} onSubmit={(event) => void submit(event)}>
    <div className={styles.fieldPair}>
      <label>{faContent.name}<input value={form.name} onChange={(e) => change("name", e.target.value)} autoComplete="name" maxLength={80} required /></label>
      <label>{faContent.subject}<input value={form.subject} onChange={(e) => change("subject", e.target.value)} maxLength={120} required /></label>
    </div>
    <div className={styles.fieldPair}>
      <label>{faContent.email + " "}<span className={styles.optional}>{faContent.oneContactMethod}</span><input type="email" value={form.email} onChange={(e) => change("email", e.target.value)} autoComplete="email" maxLength={254} /></label>
      <label>{faContent.mobile + " "}<span className={styles.optional}>{faContent.oneContactMethod}</span><input type="tel" value={form.phone} onChange={(e) => change("phone", e.target.value)} autoComplete="tel" dir="ltr" maxLength={32} /></label>
    </div>
    <label>{faContent.messageBody}<textarea value={form.message} onChange={(e) => change("message", e.target.value)} rows={6} maxLength={4000} required /></label>
    {error && <p className={styles.formError} role="alert">{error}</p>}
    <button className="button" type="submit" disabled={busy} aria-busy={busy}><ButtonLabel state={busy ? "pending" : "send"} states={{ pending: faContent.submitting, send: faContent.submitMessage }} /><Send size={17} /></button>
  </form>;
}
