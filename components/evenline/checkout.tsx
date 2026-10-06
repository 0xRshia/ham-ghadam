"use client";
import { useRef, useState } from "react";
import { Circle, CircleCheck } from "lucide-react";
import { useAuth } from "@/components/event/auth-context";
import { AppLink, useAppNavigate } from "@/components/event/app-navigation";
import { useResource } from "@/hooks/use-resource";
import { useDeadlineClock } from "@/hooks/use-deadline-clock";
import { api } from "@/lib/client";
import { registrationState } from "@/lib/registration";
import { type EventDetailData, type TicketTier, fa, faDigits, date, clock } from "@/lib/types";
import { MAX_ORDER_TOMAN } from "@/lib/payment-limits";
import { readCheckoutDraft, saveCheckoutDraft, clearCheckoutDraft } from "@/lib/checkout-draft";
import { copy } from "@/locales/fa";
import { Button, Header, LoadingState, ErrorState } from "./primitives";
import { FigmaIcon, Illustration } from "./source-icon";
import { DateBadge, Price } from "./event-card";

type Step = "tickets" | "contact" | "order" | "payment" | "success";
export function Checkout({ id }: { id: string }) {
  const resource = useResource<{ event: EventDetailData }>(`/api/events/${encodeURIComponent(id)}`);
  if (resource.loading) return <main><Header title={copy.chooseTicket} /><LoadingState /></main>;
  if (resource.error || !resource.data) return <main><Header /><ErrorState message={resource.error || copy.notFound} retry={resource.reload} /></main>;
  return <CheckoutSession key={id} event={resource.data.event} />;
}
function CheckoutSession({ event }: { event: EventDetailData }) {
  const { user, loading: authLoading, paymentReady, skipPayDevEnabled } = useAuth();
  const navigate = useAppNavigate();
  const [step, setStep] = useState<Step>("tickets");
  const [draft] = useState(()=>readCheckoutDraft(event.id));
  const [counts, setCounts] = useState<Record<string, number>>(draft?.counts ?? {});
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState("");
  const [following, setFollowing] = useState(event.organizer?.following ?? false);
  const [savingFollow, setSavingFollow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reservationId, setReservationId] = useState("");
  const requestKey = useRef<string | null>(draft?.requestKey ?? null);
  const submitting = useRef(false);
  const now = useDeadlineClock(Math.min(event.starts_at, event.registration_ends_at), 60000, event.serverNow);
  const open = now !== null && registrationState(event, now) === "open";
  const tiers: TicketTier[] = event.ticketTiers?.length ? event.ticketTiers : [{ id: "standard", event_id: event.id, name: copy.regular, description: event.description, price: event.price, remaining: event.remaining, capacity: event.capacity, position: 0, active: 1 }];
  const quantity = tiers.reduce((sum, tier) => sum + (counts[tier.id] ?? 0), 0);
  const total = tiers.reduce((sum, tier) => sum + tier.price * (counts[tier.id] ?? 0), 0);
  const paymentUnavailable = total > 0 && !skipPayDevEnabled && (!paymentReady || event.sample === 1);
  const selected = tiers.filter(tier => counts[tier.id] > 0);
  const validSelection = quantity > 0 && quantity <= 6 && quantity <= (event.remaining ?? 6) && total <= MAX_ORDER_TOMAN && selected.every(tier=>counts[tier.id] <= (tier.remaining ?? 6));
  const eventHref = `/events/${encodeURIComponent(event.id)}`;
  const titles: Record<Step, string> = { tickets: copy.chooseTicket, contact: copy.contactInformation, order: copy.orderSummary, payment: copy.paymentMethod, success: copy.payment };
  function advance() {
    setError("");
    if (!open || !validSelection) return;
    if (!user) { try {saveCheckoutDraft(event.id,counts,requestKey.current);}catch{setError(copy.saveFailed);return;}navigate(`/login?next=${encodeURIComponent(`${eventHref}/tickets`)}`); return; }
    if (!name) setName(user.name);
    setStep("contact");
  }
  function back() {
    setError("");
    setStep(step === "payment" ? "order" : step === "order" ? "contact" : "tickets");
  }
  async function book() {
    if (!user || submitting.current || !open || !validSelection || paymentUnavailable) return;
    submitting.current = true; setBusy(true); setError("");
    requestKey.current ??= crypto.randomUUID();
    try {
      saveCheckoutDraft(event.id,counts,requestKey.current);
      const result = await api<{ reservation: { id: string; status: string }; paymentUrl: string | null }>("/api/reservations", {
        eventId: event.id, quantity, name: name.trim(), email, requestKey: requestKey.current,
        ...(event.ticketTiers?.length ? { items: selected.map(tier => ({ tierId: tier.id, quantity: counts[tier.id] })) } : {}),
      });
      if (result.paymentUrl) {clearCheckoutDraft(event.id);window.location.assign(result.paymentUrl);}
      else if (result.reservation.status === "confirmed") { clearCheckoutDraft(event.id);setReservationId(result.reservation.id); setStep("success"); }
      else {clearCheckoutDraft(event.id);navigate(`/reservations/${encodeURIComponent(result.reservation.id)}`);}
    } catch (error) { setError((error as Error).message); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <main className={`el-checkout el-bottom-space ${step === "tickets" ? "el-checkout-selection" : ""}`}>
    <Header title={titles[step]} back={eventHref} onBack={step !== "tickets" && step !== "success" ? back : undefined} />
    {step === "success" ? <div className="el-success"><Illustration kind="payment" /><h1>{copy.bookingSuccess}</h1><p>{copy.bookingSuccessDescription}</p><AppLink className="el-button el-button-primary" href={`/reservations?booked=${encodeURIComponent(reservationId)}`}>{copy.viewTickets}</AppLink><AppLink className="el-button el-button-secondary" href="/">{copy.backHome}</AppLink></div> : <>
      {step === "tickets" && <>
        <div className="el-date-selector el-edition-selector" aria-label={copy.checkoutDate}>{(event.editions?.length ? event.editions : [event]).map(edition=><AppLink key={edition.id} href={`/events/${encodeURIComponent(edition.id)}/tickets`} aria-current={edition.id===event.id ? "date" : undefined} aria-label={`${date(edition.starts_at,true)}، ${clock(edition.starts_at)}، ${edition.title}`}><DateBadge value={edition.starts_at}/></AppLink>)}</div>
        <section className="el-ticket-options"><h2>{copy.chooseTicket}</h2><div className="el-tier-list">{tiers.map(tier => {
          const count = counts[tier.id] ?? 0;
          const canAdd = open && quantity < 6 && quantity < (event.remaining ?? 6) && count < (tier.remaining ?? 6) && total + tier.price <= MAX_ORDER_TOMAN;
          const update = (value: number) => { requestKey.current = null; const next={...counts,[tier.id]:value};setCounts(next);try{saveCheckoutDraft(event.id,next,null);}catch{setError(copy.saveFailed);} };
          return <article className={`el-tier-card${count ? " selected" : ""}`} key={tier.id}>
            <header><span>{tier.name}</span>{count ? <CircleCheck size={20} aria-hidden="true" /> : <Circle size={20} aria-hidden="true" />}</header>
            <div className="el-tier-body">{event.image && <img src={event.image} alt="" />}<div><h3>{event.title}</h3><div className="el-tier-meta"><span>{tier.remaining === null ? copy.unlimited : `${fa(tier.remaining)} ${copy.spotsLeft}`}</span><strong><Price value={tier.price} /></strong></div></div></div>
            <footer><details><summary>{copy.ticketBenefits}</summary><p>{tier.description}</p></details><div className="el-quantity" role="group" aria-label={`${copy.quantity} ${tier.name}`}><button aria-label={copy.decrease} disabled={!count} onClick={() => update(count - 1)}><FigmaIcon screen={24} name="minus" size={20} /></button><output aria-live="polite">{fa(count)}</output><button aria-label={copy.increase} disabled={!canAdd} onClick={() => update(count + 1)}><FigmaIcon screen={24} name="plus" size={20} /></button></div></footer>
          </article>;
        })}</div></section>
      </>}
      {step === "contact" && <form id="contact-form" className="el-checkout-content" onSubmit={e => { e.preventDefault(); setStep("order"); }}>
        <div className="el-contact-fields"><label className="el-input-field"><span>{copy.buyer}</span><input value={name} autoComplete="name" required minLength={2} maxLength={80} onChange={e => setName(e.target.value)} /></label><label className="el-input-field"><span>{copy.email}</span><span className="el-contact-input"><FigmaIcon screen={25} name="mail"/><input type="email" dir="ltr" autoComplete="email" value={email} maxLength={254} onChange={e => setEmail(e.target.value)} /></span></label><label className="el-input-field"><span>{copy.phone}</span><span className="el-contact-input"><FigmaIcon screen={25} name="phone"/><input value={faDigits(user?.phone ?? "")} readOnly dir="ltr" /></span></label></div>
        {event.organizer && user?.id !== event.host_id && <label className="el-check el-checkout-updates"><input type="checkbox" checked={following} disabled={savingFollow} onChange={async change => { const enabled=change.target.checked;setSavingFollow(true);setError("");try { await api(`/api/organizers/${event.host_id}/follow`,{},enabled ? "PUT" : "DELETE");setFollowing(enabled); } catch(error) { setError((error as Error).message); } finally { setSavingFollow(false); } }}/><span>{copy.checkoutOrganizerUpdates}</span></label>}
        <p className="el-checkout-terms">{copy.checkoutConsent} <AppLink href="/privacy">{copy.privacy}</AppLink> {copy.checkoutBuyerDisclosure}</p>
      </form>}
      {step === "order" && <div className="el-checkout-content">
        <div className="el-order-event">{event.image && <img src={event.image} alt="" />}<div><h2>{event.title}</h2><div className="el-order-event-meta"><p><FigmaIcon screen={26} name="calendar" size={14}/>{date(event.starts_at,true)}</p><p><FigmaIcon screen={26} name="clock" size={14}/>{clock(event.starts_at)} — {clock(event.ends_at)}</p></div></div></div>
        <section><h2>{copy.orderSummary}</h2><div className="el-summary-box">{selected.map(tier => <p key={tier.id}><span>{tier.name} × {fa(counts[tier.id])}</span><strong><Price value={tier.price * counts[tier.id]} /></strong></p>)}<p><span>{copy.subtotal}</span><strong><Price value={total} /></strong></p><p><span>{copy.fees}</span><strong><Price value={0} /></strong></p><hr /><p className="el-order-total"><span>{copy.total}</span><strong><Price value={total} /></strong></p></div></section>
        <section><div className="el-section-heading"><h2>{copy.paymentMethod}</h2><button className="el-text-action" onClick={()=>setStep("payment")}>{copy.edit} <FigmaIcon screen={26} name="chevron-right" size={16} directional/></button></div><button className="el-payment-option el-order-payment" onClick={() => setStep("payment")}><span><strong>{total > 0 ? copy.zarinpal : copy.free}</strong><small>{total > 0 ? copy.payOnline : copy.freeBookingMethod}</small></span><span className="el-order-payment-icon"><FigmaIcon screen={42} name="ticket" size={24}/></span></button></section>
      </div>}
      {step === "payment" && <div className="el-checkout-content el-payment-content"><label className="el-payment-option"><span>{total > 0 ? copy.zarinpal : copy.freeBookingMethod}</span><input type="radio" checked readOnly name="payment" /></label><p className="el-muted">{total > 0 ? copy.payExplanation : copy.freeBookingExplanation}</p>{skipPayDevEnabled && total > 0 && <p>{copy.demoPayment}</p>}{paymentUnavailable && <ErrorState message={copy.paymentUnavailable} />}</div>}
      {!open && now !== null && <ErrorState message={copy.closed} />}{error && <ErrorState message={error} />}
      {/* Replacing the footer prevents a click from submitting the next step's form. */}
      <footer key={step} className={`el-action-footer${step !== "payment" ? " el-purchase-footer" : ""}`}>
        {step !== "payment" && <div><strong><Price value={total} /></strong><p>{fa(quantity)} {copy.selectedTickets}</p></div>}
        {step === "tickets" ? <Button disabled={!open || !validSelection || authLoading} onClick={advance}>{copy.continue}</Button> : step === "contact" ? <Button form="contact-form" type="submit" disabled={!open || savingFollow}>{copy.continue}</Button> : step === "order" ? <Button disabled={!open} onClick={() => setStep("payment")}>{copy.continue}</Button> : <Button disabled={busy || !open || paymentUnavailable} aria-busy={busy} onClick={() => void book()}>{busy ? copy.bookingBusy : copy.confirm}</Button>}
      </footer>
    </>}
  </main>;
}
