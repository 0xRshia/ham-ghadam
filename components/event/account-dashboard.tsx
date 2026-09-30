"use client";

import { faContent, faMessages } from "@/locales/domain-fa";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { ArrowLeft, CalendarDays, Clock3, Moon, Sun, Ticket, UserRound } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsPanels, TabsTrigger } from "@/components/ui/tabs";
import { ButtonLabel } from "@/components/ui/button-label";
import { AppLink } from "@/components/event/app-navigation";
import { ReservationHistory } from "@/components/event/reservation-history";
import { ReceiptActions } from "@/components/event/receipt-actions";
import { useAuth } from "@/components/event/auth-context";
import { api } from "@/lib/client";
import type { AccountSummary } from "@/lib/account-types";
import { reservationAmountLabel, reservationStatusLabel } from "@/lib/account-types";
import { clock, date, fa, faDigits } from "@/lib/types";
import { eventLocationUrl } from "@/lib/location-url";
import { useDeadlineClock } from "@/hooks/use-deadline-clock";
import { ErrorBox, Loading } from "@/components/event/shared";
import layouts from "@/components/event/page-layouts.module.css";

export function AccountDashboard() {
  const { user, loading: authLoading, refresh, logout, loggingOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [paymentBusy, setPaymentBusy] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const currentTime = useDeadlineClock(summary?.latestPurchase?.expires_at ?? undefined, 1000, summary?.serverNow);

  useEffect(() => {
    if (!user) return;
    let active = true;
    api<AccountSummary>("/api/account/summary")
      .then((data) => { if (active) { setSummary(data); setName(data.user.name); } })
      .catch((error: Error) => { if (active) setLoadError(error.message); });
    return () => { active = false; };
  }, [user]);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveBusy) return;
    setSaveBusy(true);
    setSaveError("");
    setSaveMessage("");
    try {
      const result = await api<{ user: { name: string } }>("/api/me", { name }, "PATCH");
      setName(result.user.name);
      setSummary((current) => current ? { ...current, user: { ...current.user, name: result.user.name } } : current);
      await refresh();
      setSaveMessage(faContent.accountNameUpdated);
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setSaveBusy(false);
    }
  }

  async function paymentAction(id: string, action: "retry" | "verify") {
    if (paymentBusy) return;
    setPaymentBusy(action);
    setPaymentError("");
    try {
      const result = await api<{ paymentUrl?: string }>(`/api/reservations/${encodeURIComponent(id)}`, { action });
      if (result.paymentUrl) { window.location.assign(result.paymentUrl); return; }
      const updated = await api<AccountSummary>("/api/account/summary");
      setSummary(updated);
    } catch (error) {
      setPaymentError((error as Error).message);
    } finally {
      setPaymentBusy("");
    }
  }

  if (authLoading) return <main className={`container subpage ${layouts.page}`}><Loading variant="account" /></main>;
  if (!user) return <main className={`container subpage ${layouts.page}`}><section className="blank"><h1>{faContent.accountLoginTitle}</h1><p>{faContent.accountLoginHint}</p><AppLink className="button" href="/login?next=%2Faccount">{faContent.accountLogin + " "}<ArrowLeft size={17} /></AppLink></section></main>;
  if (loadError) return <main className={`container subpage ${layouts.page}`}><ErrorBox message={loadError} retry={() => { setLoadError(""); setSummary(null); api<AccountSummary>("/api/account/summary").then(setSummary).catch((error: Error) => setLoadError(error.message)); }} /></main>;
  if (!summary) return <main className={`container subpage ${layouts.page}`}><Loading variant="account" /></main>;

  const latest = summary.latestPurchase;
  const outstanding = summary.latestOutstanding;
  const now = currentTime ?? summary.serverNow;
  const latestStatus = latest ? reservationStatusLabel(latest.status, latest.payment_state, latest.total, latest.ends_at, now) : "";
  const location = latest ? eventLocationUrl(latest) : null;
  return <main data-motion-group className={`container subpage ${layouts.page} account-dashboard`}>
    <div className={`page-heading ${layouts.pageHeading}`}>
      <div className="eyebrow"><UserRound size={17} /> {" " + faContent.account}</div>
      <h1>{faContent.hello + " "}{user.name || faContent.appName}</h1>
      <p>{faContent.accountDescription}</p>
    </div>
    <section className={`${layouts.accountProfile} account-dashboard-profile`} aria-label={faContent.accountInformation}>
      <div className={layouts.accountIdentity}><span className={layouts.accountAvatar}><UserRound size={28} aria-hidden="true" /></span><div><h2>{user.name || faContent.yourAccount}</h2><p>{faContent.mobile + " "}<bdi>{faDigits(user.phone)}</bdi></p></div></div>
      <button className="button outline" type="button" onClick={logout} disabled={loggingOut} aria-busy={loggingOut}><ButtonLabel busy={loggingOut} pending={faContent.loggingOut}>{faContent.logout}</ButtonLabel></button>
    </section>
    <Tabs defaultValue="overview" dir="rtl">
      <TabsList className="page-tabs account-tabs">
        <TabsTrigger value="overview">{faContent.overview}</TabsTrigger>
        <TabsTrigger value="purchases">{faContent.purchasesOpenParenthesis}{fa(summary.reservationCount)})</TabsTrigger>
        <TabsTrigger value="settings">{faContent.settings}</TabsTrigger>
      </TabsList>
      <TabsPanels>
        <TabsContent value="overview">
          <section className="account-stat-grid" aria-label={faContent.accountSummary}>
            <article><Ticket size={19} /><strong>{fa(summary.reservationCount)}</strong><span>{faContent.reservation}</span></article>
            <article><CalendarDays size={19} /><strong>{fa(summary.confirmedCount)}</strong><span>{faContent.confirmedBooking}</span></article>
            <article><Clock3 size={19} /><strong>{fa(summary.outstandingCount)}</strong><span>{faContent.awaitingPayment}</span></article>
          </section>
          <section className="account-latest" aria-labelledby="latest-purchase-heading">
            <div className="account-section-heading"><div><span className="eyebrow">{faContent.lastPurchase}</span><h2 id="latest-purchase-heading">{faContent.latestReservation}</h2></div><AppLink className="text-button" href="/reservations">{faContent.allPurchases + " "}<ArrowLeft size={16} /></AppLink></div>
            {latest ? <article className="account-latest-card">
              {latest.image && <img src={latest.image} alt={faMessages.imageAlt(String(latest.title))} />}
              <div className="account-latest-info"><span className="status success">{latestStatus}</span><h3>{latest.title}</h3><p>{date(latest.created_at, true)}{faContent.timeSeparator + " "}{clock(latest.created_at)}</p><p>{date(latest.starts_at, true)}{faContent.timeSeparator + " "}{clock(latest.starts_at)} · {latest.venue}</p><div className="reservation-meta"><span>{fa(latest.quantity)} {" " + faContent.person}</span><strong>{reservationAmountLabel(latest.status, latest.payment_state, latest.total)}</strong></div>{latest.reference && <p className="ticket-code">{faContent.paymentReferenceLabel + " "}<bdi>{latest.reference}</bdi></p>}{latest.payment_state === "skipped_dev" && <p className="notice">{faContent.noPaymentReceived}</p>}<div className="account-latest-actions"><ReceiptActions reservationId={latest.id} />{location && <a className="button outline" href={location} target="_blank" rel="noopener noreferrer">{faContent.viewVenue}</a>}</div></div>
            </article> : <div className="account-empty"><p>{faContent.noPurchases}</p><AppLink className="button" href="/">{faContent.discoverEvents + " "}<ArrowLeft size={17} /></AppLink></div>}
          </section>
          {outstanding && <section className="account-latest account-outstanding" aria-labelledby="outstanding-heading">
            <div className="account-section-heading"><div><span className="eyebrow">{fa(summary.outstandingCount)} {" " + faContent.openItem}</span><h2 id="outstanding-heading">{faContent.bookingNeedsFollowup}</h2></div><AppLink className="text-button" href="/reservations">{faContent.allPurchases + " "}<ArrowLeft size={16} /></AppLink></div>
            <article className="account-outstanding-card"><div><span className="status">{reservationStatusLabel(outstanding.status, outstanding.payment_state, outstanding.total, outstanding.status === "hold" ? (outstanding.expires_at ?? 0) : outstanding.ends_at, now)}</span><h3>{outstanding.title}</h3><p>{date(outstanding.created_at, true)} · {reservationAmountLabel(outstanding.status, outstanding.payment_state, outstanding.total)}</p>{outstanding.status === "hold" && (outstanding.expires_at ?? 0) > now && <p className="hold-countdown" role="timer" aria-live="off">{faContent.paymentDeadline + " "}{fa(Math.ceil(((outstanding.expires_at ?? now) - now) / 1000))} {" " + faContent.seconds}</p>}{outstanding.status === "paid_unfulfilled" && <p className="notice">{faContent.paidReservationFollowup}</p>}</div><div className="account-payment-actions">{outstanding.status === "hold" && (outstanding.expires_at ?? 0) > now && <button className="button" disabled={!!paymentBusy} onClick={() => void paymentAction(outstanding.id, "retry")}><ButtonLabel busy={paymentBusy === "retry"} pending={faContent.preparing}>{faContent.continuePayment}</ButtonLabel></button>}{outstanding.status === "hold" && <button className="button outline" disabled={!!paymentBusy} onClick={() => void paymentAction(outstanding.id, "verify")}><ButtonLabel busy={paymentBusy === "verify"} pending={faContent.checking}>{faContent.checkPayment}</ButtonLabel></button>}{outstanding.status === "paid_unfulfilled" && <ReceiptActions reservationId={outstanding.id} />}</div>{paymentError && <p className="form-error" role="alert">{paymentError}</p>}</article>
          </section>}
        </TabsContent>
        <TabsContent value="purchases"><ReservationHistory embedded /></TabsContent>
        <TabsContent value="settings">
          <section className="account-settings-card"><form className="auth-form" onSubmit={saveProfile}><h2>{faContent.accountInformation}</h2><label htmlFor="account-name">{faContent.fullName}</label><input id="account-name" autoComplete="name" minLength={2} maxLength={80} required value={name} onChange={(event) => setName(event.target.value)} /><label htmlFor="account-phone">{faContent.mobile}</label><input id="account-phone" value={faDigits(user.phone)} readOnly aria-describedby="account-phone-help" /><small id="account-phone-help">{faContent.phoneImmutableHint}</small>{saveError && <p className="form-error" role="alert">{saveError}</p>}{saveMessage && <p className="success-box" role="status">{saveMessage}</p>}<button className="button" disabled={saveBusy} aria-busy={saveBusy}><ButtonLabel busy={saveBusy} pending={faContent.saving}>{faContent.saveName}</ButtonLabel></button></form>
            <div className="account-theme"><div><h2>{faContent.appearance}</h2><p>{faContent.appearanceStorageHint}</p></div><div className="account-theme-buttons"><button type="button" className={`button outline${theme === "light" ? " selected" : ""}`} aria-pressed={theme === "light"} onClick={() => setTheme("light")}><Sun size={18} /> {" " + faContent.light}</button><button type="button" className={`button outline${theme === "dark" ? " selected" : ""}`} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}><Moon size={18} /> {" " + faContent.dark}</button></div></div>
          </section>
        </TabsContent>
      </TabsPanels>
    </Tabs>
  </main>;
}
