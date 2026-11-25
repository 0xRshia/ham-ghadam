"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CalendarDays, Clock, CreditCard, ImageIcon, Mail, Phone } from "lucide-react";
import { useAuth } from "@/components/event/auth-context";
import { AppLink, useAppNavigate } from "@/components/event/app-navigation";
import { useResource } from "@/hooks/use-resource";
import { useDeadlineClock } from "@/hooks/use-deadline-clock";
import { api, ClientError } from "@/lib/client";
import { registrationState, registrationClosesAt } from "@/lib/registration";
import { type EventDetailData, fa, faDigits, date, clock } from "@/lib/types";
import { eventTicketTiers, ticketSelection } from "@/lib/ticket-selection";
import { readCheckoutDraft, saveCheckoutDraft, clearCheckoutDraft, type CheckoutDraft } from "@/lib/checkout-draft";
import { isSquirrelCoupon, normalizeSquirrelCoupon, squirrelTicketDiscount } from "@/lib/squirrel-coupon";
import { copy } from "@/locales/fa";
import { Button, Header, LoadingState, ErrorState } from "./primitives";
import { FigmaIcon, Illustration } from "./source-icon";
import { Price } from "./event-card";
import { eventPurchasable } from "@/lib/product-mode";

type Step = "contact" | "order" | "payment" | "success";
const subscribeMounted = () => () => {};
export function Checkout({ id }: { id: string }) {
  const mounted = useSyncExternalStore(subscribeMounted, () => true, () => false);
  const resource = useResource<{ event: EventDetailData }>(`/api/events/${encodeURIComponent(id)}`);
  if (resource.loading || !mounted) return <main><Header title={copy.contactInformation} /><LoadingState /></main>;
  if (resource.error || !resource.data) return <main><Header /><ErrorState message={resource.error || copy.notFound} retry={resource.reload} /></main>;
  return <CheckoutEntry key={id} event={resource.data.event} />;
}
function CheckoutEntry({ event }: { event: EventDetailData }) {
  const { user, loading } = useAuth();
  const navigate = useAppNavigate();
  const [draft] = useState(() => readCheckoutDraft(event.id));
  const valid = eventPurchasable(event) && !!draft && ticketSelection(eventTicketTiers(event, copy.regular), draft.counts, event.remaining).valid;
  const eventHref = "/events/" + encodeURIComponent(event.id);
  useEffect(() => {
    if (!valid) navigate(eventHref, { replace: true });
    else if (!loading && !user) navigate("/login?next=" + encodeURIComponent(eventHref + "/tickets"), { replace: true });
  }, [valid, eventHref, loading, user, navigate]);
  if (!valid || loading || !user || !draft) return <main><Header back={eventHref} /><LoadingState /></main>;
  return <CheckoutSession event={event} draft={draft} />;
}
function CheckoutSession({ event, draft }: { event: EventDetailData; draft: CheckoutDraft }) {
  const { user, paymentReady, skipPayDevEnabled } = useAuth();
  const navigate = useAppNavigate();
  const [step, setStep] = useState<Step>("contact");
  const [counts] = useState<Record<string, number>>(draft?.counts ?? {});
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState("");
  const [following, setFollowing] = useState(event.organizer?.following ?? false);
  const [savingFollow, setSavingFollow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [couponInput, setCouponInput] = useState(draft.couponCode ?? "");
  const [couponError, setCouponError] = useState("");
  const [reservationId, setReservationId] = useState("");
  const requestKey = useRef<string | null>(draft?.requestKey ?? null);
  const submitting = useRef(false);
  const now = useDeadlineClock(registrationClosesAt(event), 60000, event.serverNow);
  const open = now !== null && registrationState(event, now) === "open";
  const tiers = eventTicketTiers(event, copy.regular);
  const { quantity, total, selected, valid: validSelection } = ticketSelection(tiers, counts, event.remaining);
  const acceptsCoupon = total > 0 && event.sample !== 1;
  const normalizedCoupon = acceptsCoupon ? normalizeSquirrelCoupon(couponInput) : "";
  const couponCode = isSquirrelCoupon(normalizedCoupon) ? normalizedCoupon : undefined;
  const couponInvalid = Boolean(couponError || (normalizedCoupon && !couponCode));
  const couponDiscount = couponCode && !couponError ? squirrelTicketDiscount(total) : 0;
  const amountDue = total - couponDiscount;
  const coveredByCoupon = couponDiscount > 0 && amountDue === 0;
  const displayDue = coveredByCoupon ? <>{fa(0)} <small>{copy.toman}</small></> : <Price value={amountDue} />;
  const paymentUnavailable = amountDue > 0 && !skipPayDevEnabled && (!paymentReady || event.sample === 1);
  const paymentLabel = amountDue > 0 ? copy.zarinpal : coveredByCoupon ? copy.checkoutCouponCovered : copy.freeBookingMethod;
  const eventHref = `/events/${encodeURIComponent(event.id)}`;
  const titles: Record<Step, string> = { contact: copy.contactInformation, order: copy.checkoutOrderDetails, payment: copy.paymentMethod, success: copy.payment };
  function back() {
    if (submitting.current) return;
    setError("");
    if (step === "contact") navigate(eventHref);
    else setStep(step === "payment" ? "order" : "contact");
  }
  function editCoupon(value: string) {
    setCouponInput(value);
    setCouponError("");
    requestKey.current = null;
    setError("");
    const code = normalizeSquirrelCoupon(value);
    try { saveCheckoutDraft(event.id, counts, null, isSquirrelCoupon(code) ? code : undefined); }
    catch { /* A browser can block persistence while the current checkout stays open. */ }
  }
  async function book() {
    if (!user || submitting.current || !open || !validSelection || couponInvalid || paymentUnavailable) return;
    submitting.current = true; setBusy(true); setError("");
    requestKey.current ??= crypto.randomUUID();
    try {
      saveCheckoutDraft(event.id, counts, requestKey.current, couponCode);
      const result = await api<{ reservation: { id: string; status: string }; paymentUrl: string | null }>("/api/reservations", {
        eventId: event.id, quantity, name: name.trim(), email, requestKey: requestKey.current,
        ...(event.ticketTiers?.length ? { items: selected.map(tier => ({ tierId: tier.id, quantity: counts[tier.id] })) } : {}),
        ...(couponCode ? { couponCode } : {}),
      });
      if (result.paymentUrl) {clearCheckoutDraft(event.id);window.location.assign(result.paymentUrl);}
      else if (result.reservation.status === "confirmed") { clearCheckoutDraft(event.id);setReservationId(result.reservation.id); setStep("success"); }
      else {clearCheckoutDraft(event.id);navigate(`/reservations/${encodeURIComponent(result.reservation.id)}`);}
    } catch (error) {
      if (error instanceof ClientError && typeof error.details.code === "string" && error.details.code.startsWith("squirrel_coupon_")) {
        setCouponError(error.message);
        setStep("order");
      } else setError((error as Error).message);
    }
    finally { submitting.current = false; setBusy(false); }
  }
  return <main className={`el-checkout el-bottom-space el-checkout-${step}`}>
    <Header title={titles[step]} back={eventHref} onBack={step !== "success" ? back : undefined} />
    {step === "success" ? <div className="el-success"><Illustration kind="payment" /><h1>{copy.bookingSuccess}</h1><p>{copy.bookingSuccessDescription}</p><AppLink className="el-button el-button-primary" href={`/reservations?booked=${encodeURIComponent(reservationId)}`}>{copy.viewTickets}</AppLink><AppLink className="el-button el-button-secondary" href="/">{copy.backHome}</AppLink></div> : <>
      {step === "contact" && <form id="contact-form" className="el-checkout-content" onSubmit={e => { e.preventDefault(); setStep("order"); }}>
        <div className="el-contact-fields"><label className="el-input-field"><span>{copy.checkoutFullName}</span><input value={name} autoComplete="name" required minLength={2} maxLength={80} onChange={e => setName(e.target.value)} /></label><label className="el-input-field"><span>{copy.email}</span><span className="el-contact-input"><Mail size={18} aria-hidden="true"/><input type="email" dir="ltr" autoComplete="email" value={email} maxLength={254} onChange={e => setEmail(e.target.value)} /></span></label><label className="el-input-field"><span>{copy.phone}</span><span className="el-contact-input"><Phone size={18} aria-hidden="true"/><input value={faDigits(user?.phone ?? "")} readOnly dir="ltr" /></span></label></div>
        {user?.id !== event.host_id && <label className="el-check el-checkout-updates"><input type="checkbox" checked={!!following} disabled={savingFollow || !event.organizer} aria-describedby={!event.organizer ? "checkout-updates-unavailable" : undefined} onChange={async change => { const enabled=change.target.checked;setSavingFollow(true);setError("");try { await api(`/api/organizers/${event.host_id}/follow`,{},enabled ? "PUT" : "DELETE");setFollowing(enabled); } catch(error) { setError((error as Error).message); } finally { setSavingFollow(false); } }}/><span>{copy.checkoutOrganizerUpdates}{!event.organizer && <small id="checkout-updates-unavailable">{copy.checkoutUpdatesUnavailable}</small>}</span></label>}
        <p className="el-checkout-terms">{copy.checkoutConsent} <AppLink href="/privacy">{copy.privacy}</AppLink> {copy.checkoutBuyerDisclosure}</p>
      </form>}
      {step === "order" && <div className="el-checkout-content">
        <div className="el-order-event">{event.image ? <img src={event.image} alt="" /> : <span className="el-order-image-placeholder"><ImageIcon size={28} aria-hidden="true" /></span>}<div><h2>{event.title}</h2><div className="el-order-event-meta"><p><CalendarDays size={14} aria-hidden="true"/>{date(event.starts_at,true)}</p><p><Clock size={14} aria-hidden="true"/>{clock(event.starts_at)} — {clock(event.ends_at)}</p></div></div></div>
        {acceptsCoupon && <div className="el-checkout-coupon">
          <label className="el-input-field">
            <span>{copy.checkoutCoupon}</span>
            <input dir="ltr" value={couponInput} maxLength={40} autoComplete="off" autoCapitalize="characters" spellCheck={false}
              aria-invalid={couponInvalid || undefined} aria-describedby="checkout-coupon-hint"
              onChange={event => editCoupon(event.target.value)} />
          </label>
          <p id="checkout-coupon-hint" role={couponError ? "alert" : undefined} aria-live="polite">{couponError || (couponInvalid ? copy.checkoutCouponFormat : copy.checkoutCouponEstimate)}</p>
        </div>}
        <section><h2>{copy.orderSummary}</h2><div className="el-summary-box">
          {selected.map(tier => <p key={tier.id}><span>{tier.name} × {fa(counts[tier.id])}</span><strong><Price value={tier.price * counts[tier.id]} /></strong></p>)}
          <p><span>{copy.subtotal}</span><strong><Price value={total} /></strong></p>
          <p><span>{copy.fees}</span><strong><Price value={0} /></strong></p>
          {couponDiscount > 0 && <p className="el-checkout-coupon-discount"><span>{copy.checkoutCouponDiscount}</span><strong><Price value={couponDiscount} /></strong></p>}
          <hr /><p className="el-order-total" aria-live="polite"><span>{couponDiscount > 0 ? copy.checkoutCouponTotal : copy.total}</span><strong>{displayDue}</strong></p>
        </div></section>
        <section><div className="el-section-heading"><h2>{copy.paymentMethod}</h2><button className="el-text-action" disabled={couponInvalid} onClick={()=>setStep("payment")}>{copy.edit} <FigmaIcon screen={26} name="chevron-right" size={16} directional/></button></div><button className="el-payment-option el-order-payment" disabled={couponInvalid} onClick={() => setStep("payment")}><span><strong>{amountDue > 0 || coveredByCoupon ? paymentLabel : copy.free}</strong><small>{amountDue > 0 ? copy.payOnline : coveredByCoupon ? copy.checkoutCouponCoveredHint : copy.freeBookingMethod}</small></span><span className="el-order-payment-icon"><CreditCard size={24} aria-hidden="true"/></span></button></section>
      </div>}
      {step === "payment" && <div className="el-checkout-content el-payment-content"><label className="el-payment-option"><span>{paymentLabel}</span><input type="radio" checked readOnly name="payment" /></label><p className="el-muted">{amountDue > 0 ? copy.payExplanation : coveredByCoupon ? copy.checkoutCouponCoveredHint : copy.freeBookingExplanation}</p>{skipPayDevEnabled && amountDue > 0 && <p>{copy.demoPayment}</p>}{paymentUnavailable && <ErrorState message={copy.paymentUnavailable} />}</div>}
      {!open && now !== null && <ErrorState message={copy.closed} />}{error && <ErrorState message={error} />}
      {/* Replacing the footer prevents a click from submitting the next step's form. */}
      <footer key={step} className={`el-action-footer${step !== "payment" ? " el-purchase-footer" : ""}`}>
        {step !== "payment" && <div><strong>{quantity ? (step === "order" ? displayDue : <Price value={total} />) : copy.chooseTicket}</strong><p>{fa(quantity)} {copy.selectedTickets}</p></div>}
        {step === "contact" ? <Button form="contact-form" type="submit" disabled={!open || !validSelection || savingFollow}>{copy.checkoutRegister}</Button> : step === "order" ? <Button disabled={!open || !validSelection || couponInvalid} onClick={() => setStep("payment")}>{coveredByCoupon ? copy.checkoutRegister : copy.checkoutContinuePayment}</Button> : <Button disabled={busy || !open || paymentUnavailable || couponInvalid} aria-busy={busy} onClick={() => void book()}>{busy ? copy.bookingBusy : copy.confirm}</Button>}
      </footer>
    </>}
  </main>;
}
