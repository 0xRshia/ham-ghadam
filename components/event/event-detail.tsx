"use client";
import { faContent, faMessages } from "@/locales/domain-fa";
import { useSearchParams } from "next/navigation";
import { ButtonLabel } from "@/components/ui/button-label";
import { AppLink, useAppNavigate } from "@/components/event/app-navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  ArrowLeft,
  MapPin,
  CalendarDays,
  Clock3,
  Plus,
  Minus,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "./auth-context";
import { maxTicketQuantity, requestedTicketQuantity } from "@/lib/ticket-selection";
import { api } from "@/lib/client";
import { eventLocationUrl } from "@/lib/location-url";
import { Blank, ErrorBox, Loading } from "./shared";
import { LoadingPage } from "./loading";
import { EventGallery } from "./event-gallery";
import { RegistrationCountdown } from "./registration-countdown";
import { useDeadlineClock } from "@/hooks/use-deadline-clock";
import { registrationState, REGISTRATION_CLOSED } from "@/lib/registration";
import { fa, faDigits, date, clock, categories, type EventDetailData } from "@/lib/types";
import styles from "./ticket-download.module.css";
import detail from "./event-detail.module.css";
import { ReviewSection } from "./review-section";
export default function EventDetail({ id }: { id: string }) {
  return <Suspense fallback={<LoadingPage variant="event" />}><EventDetailSession id={id} /></Suspense>;
}

function EventDetailSession({ id }: { id: string }) {
  const requestedQuantity = useSearchParams().get("quantity");
  const { user } = useAuth();
  return <EventDetailContent key={`${id}:${requestedQuantity}:${user?.id ?? "guest"}`} id={id} requestedQuantity={requestedQuantity} />;
}

function EventDetailContent({ id, requestedQuantity }: { id: string; requestedQuantity: string | null }) {
  const navigate = useAppNavigate();
  const requestVersion = useRef(0);
  const submitting = useRef(false);
  const purchaseButton = useRef<HTMLButtonElement>(null);
  const decreaseButton = useRef<HTMLButtonElement>(null);
  const [event, setEvent] = useState<EventDetailData | null>(null),
    [serverNow, setServerNow] = useState<number>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [quantity, setQuantity] = useState(0),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [buyerName, setBuyerName] = useState(""),
    [key, setKey] = useState(""),
    [bookingError, setBookingError] = useState("");
  const { user, loading: authLoading, paymentReady, skipPayDevEnabled } = useAuth();
  const now = useDeadlineClock(event ? Math.min(event.registration_ends_at, event.starts_at) : undefined, 60000, serverNow);
  const availability = event && now !== null ? registrationState(event, now) : "checking";
  const closed = availability !== "open";
  const load = useCallback(() => {
    const version = ++requestVersion.current;
    return api<{ event: EventDetailData; serverNow?: number }>(`/api/events/${id}`).then(({ event: loaded, serverNow: currentServerNow }) => {
      if (version !== requestVersion.current) return;
      setEvent(loaded);
      setServerNow(currentServerNow);
      setQuantity(requestedTicketQuantity(requestedQuantity, loaded));
      setConfirm(false);
    }).catch((error: Error) => {
      if (version === requestVersion.current) setError(error.message);
    }).finally(() => {
      if (version === requestVersion.current) setLoading(false);
    });
  }, [id, requestedQuantity]);
  useEffect(() => {
    void load();
    const version = requestVersion.current;
    return () => { requestVersion.current = version + 1; };
  }, [load]);
  async function book() {
    if (!event || !user || submitting.current || quantity < 1 || quantity > maxTicketQuantity(event)) return;
    if (registrationState(event, Date.now()) !== "open") {
      setConfirm(false);
      return;
    }
    const name = buyerName.trim();
    if (name.length < 2 || name.length > 80) {
      setBookingError(faContent.nameLength);
      return;
    }
    submitting.current = true;
    const version = requestVersion.current;
    setBusy(true);
    setBookingError("");
    try {
      const result = await api<{
        reservation: { id: string; status: string };
        paymentUrl: string | null;
      }>("/api/reservations", { eventId: id, quantity, name, requestKey: key });
      if (version !== requestVersion.current) return;
      if (result.paymentUrl) window.location.assign(result.paymentUrl);
      else
        navigate(
          `/reservations?${result.reservation.status === "confirmed" ? "booked" : "pending"}=${result.reservation.id}`,
        );
    } catch (e) {
      if (version === requestVersion.current) setBookingError((e as Error).message);
    } finally {
      submitting.current = false;
      if (version === requestVersion.current) setBusy(false);
    }
  }
  if (loading)
    return (
      <main data-motion-group className={`container subpage ${detail.page}`}>
        <Loading variant="event" />
      </main>
    );
  if (error)
    return (
      <main data-motion-group className={`container subpage ${detail.page}`}>
        <ErrorBox message={error} retry={() => { setLoading(true); setError(""); void load(); }} />
      </main>
    );
  if (!event) return <Blank title={faContent.eventNotFoundHeading} />;
  const mapUrl = eventLocationUrl(event);
  const category = categories.find((item) => item.id === event.category)?.label;
  const maximum = maxTicketQuantity(event);
  const paymentUnavailable = event.price > 0 && !skipPayDevEnabled && (!paymentReady || event.sample === 1);
  const purchaseDisabled = closed || authLoading || paymentUnavailable || maximum < 1;
  const startsAt = new Date(event.starts_at).toISOString();
  const price = event.price * Math.max(1, quantity);
  function continueBooking() {
    if (purchaseDisabled || quantity < 1 || quantity > maximum || !event || registrationState(event, Date.now()) !== "open") return;
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/events/${id}?quantity=${quantity}`)}`);
      return;
    }
    setKey(crypto.randomUUID());
    setBuyerName(user.name ?? "");
    setBookingError("");
    setConfirm(true);
  }
  return (
    <>
    <main data-motion-group className={`container subpage ${detail.page}`}>
      <AppLink className="back-link" href="/">
        <ArrowRight size={17} />
        {faContent.allEvents}</AppLink>
      <header className={`${detail.hero}${event.image ? "" : ` ${detail.withoutImage}`}`}>
        {event.image && <img className={detail.heroImage} src={event.image} alt={faMessages.imageAlt(String(event.title))} />}
        <div className={detail.topline}>
          <span className={detail.capacity}>
            {event.remaining === null ? faContent.unlimitedCapacity : event.remaining === 0 ? faContent.soldOut : faMessages.remainingPeople(String(fa(event.remaining)))}
          </span>
          <RegistrationCountdown key={event.id} deadline={event.registration_ends_at} serverNow={serverNow} tiles />
        </div>
        <div className={detail.heroCopy}>
          <div className={detail.categoryRow}>
            {category && <span className={detail.category}>{category}</span>}
            <time className={detail.dateStamp} dateTime={startsAt} aria-label={date(event.starts_at, true)}>
              <strong>{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric", timeZone: "Asia/Tehran" }).format(event.starts_at)}</strong>
              <span>{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "long", timeZone: "Asia/Tehran" }).format(event.starts_at)}</span>
            </time>
          </div>
          <h1>{event.title}</h1>
          <p className={detail.venue}><MapPin size={16} aria-hidden="true" /><span>{event.venue}، {event.city}</span></p>
          <div className={detail.facts}>
            <time dateTime={startsAt}><CalendarDays size={14} aria-hidden="true" />{date(event.starts_at)}</time>
            <span><Clock3 size={14} aria-hidden="true" />{faContent.hour + " "}{clock(event.starts_at)} {" " + faContent.until + " "}{clock(event.ends_at)}</span>
          </div>
        </div>
      </header>
      <article data-motion-group className={detail.article}>
        <h2>{faContent.aboutMeetup}</h2>
        <p className={detail.description}>{event.description}</p>
        <h2>{faContent.meetupLocationHeading}</h2>
        <p>{event.venue}{event.address ? `، ${event.address}` : ""}</p>
        {mapUrl && (
          <a className={`button ${detail.mapLink}`} href={mapUrl} target="_blank" rel="noopener noreferrer">
            <MapPin size={17} aria-hidden="true" />
            {faContent.viewVenueAction}<ArrowLeft size={17} aria-hidden="true" />
          </a>
        )}
        {event.sample === 1 && (
          <p className={detail.sampleNote}>{faContent.sampleEventDisclosure}</p>
        )}
        <EventGallery key={event.id} images={event.gallery} title={event.title} />
      </article>
      <ReviewSection eventId={event.id} sample={event.sample === 1} />
      {closed && availability !== "checking" && (
        <p className="notice" role="status">{availability === "sold_out" ? faContent.eventSoldOut : faContent.registrationClosed}</p>
      )}
      {paymentUnavailable && <p className="notice">{event.sample === 1 ? faContent.samplePaymentRejected : faContent.paymentLaunchHint}</p>}
      {skipPayDevEnabled && event.price > 0 && <p className="notice">{faContent.testBookingHint}</p>}
      <Dialog
        open={confirm && !closed}
        onOpenChange={(v) => {
          if (!busy) setConfirm(v);
        }}
      >
        <DialogContent className="app-dialog" dir="rtl" showCloseButton={false}>
          <DialogTitle>
            {faContent.confirm + " "}{event.price ? (skipPayDevEnabled ? faContent.reserveWithoutPayment : faContent.buyTicket) : faContent.register}
          </DialogTitle>
          <DialogDescription>
            {event.title} · {date(event.starts_at)}
          </DialogDescription>
          <div className={styles.nameField}>
            <label htmlFor="ticket-buyer-name">{faContent.buyerFullName}</label>
            <input
              id="ticket-buyer-name"
              name="name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={80}
              value={buyerName}
              disabled={busy}
              aria-describedby="ticket-buyer-help"
              onChange={(event) => setBuyerName(event.target.value)}
            />
            <small id="ticket-buyer-help">
              {quantity > 1
                ? faContent.ticketsBuyerHint
                : faContent.ticketNameHint}
              {" "}{faContent.accountPhoneLabel + " "}<bdi>{faDigits(user?.phone ?? "")}</bdi>
            </small>
          </div>
          <div className="checkout-summary">
            <p>
              {faContent.peopleCount + " "}<strong key={quantity} className="motion-number">{fa(quantity)}</strong>
            </p>
            <p>
              {faContent.finalAmount}{" "}
              <strong>
                {event.price ? faMessages.amountWithCurrency(String(fa(event.price * quantity))) : faContent.free}
              </strong>
            </p>
          </div>
          {event.price > 0 && (
            <p className="muted">
              {skipPayDevEnabled
                ? faContent.testPaymentDisclosure
                : faContent.paymentHoldHint}
            </p>
          )}
          <p className="muted">
            {faContent.pdfTicketHint}</p>
          {event.sample === 1 && (
            <p className="notice">
              {faContent.sampleCafeDisclosure}</p>
          )}
          {bookingError && <ErrorBox message={bookingError} />}
          <button className="button full" disabled={closed || busy || buyerName.trim().length < 2} aria-busy={busy} onClick={book}>
            <ButtonLabel busy={busy} pending={faContent.submitting}>
              {event.price ? (skipPayDevEnabled ? faContent.confirmReceiveTicket : faContent.goToPayment) : faContent.confirmRegistration}
            </ButtonLabel>
          </button>
          <button
            className="button outline full"
            disabled={busy}
            onClick={() => setConfirm(false)}
          >
            {faContent.back}</button>
        </DialogContent>
      </Dialog>
    </main>
    {now !== null && createPortal(
      <div className={detail.purchaseBar} data-selected={quantity > 0 || undefined} role="region" aria-label={faContent.reserveTicket} dir="rtl">
        <div className={detail.purchaseInner}>
          <div className={detail.price}>
            <span>{quantity > 0 ? faMessages.totalTickets(String(fa(quantity))) : faContent.perPersonPrice}</span>
            <strong>{event.price ? faMessages.amountWithCurrency(String(fa(price))) : faContent.free}</strong>
          </div>
          {!quantity || closed ? (
            <button ref={purchaseButton} className={`button ${detail.buyButton}`} disabled={purchaseDisabled}
              onClick={() => {
                if (registrationState(event, Date.now()) !== "open") return;
                setQuantity(1);
                requestAnimationFrame(() => decreaseButton.current?.focus());
              }}>
              {closed ? availability === "sold_out" ? faContent.soldOut : REGISTRATION_CLOSED : paymentUnavailable || maximum < 1 ? faContent.purchaseUnavailable : event.price ? faContent.buyTicket : faContent.freeRegistration}
            </button>
          ) : (
            <>
              <div className={detail.quantityControl} role="group" aria-label={faContent.ticketCount} dir="ltr">
                <button ref={decreaseButton} type="button" disabled={busy} aria-label={quantity === 1 ? faContent.removeTicketSelection : faContent.decreaseQuantity}
                  onClick={() => {
                    setQuantity((value) => Math.max(0, value - 1));
                    if (quantity === 1) requestAnimationFrame(() => purchaseButton.current?.focus());
                  }}>
                  {quantity === 1 ? <Trash2 size={18} /> : <Minus size={18} />}
                </button>
                <strong aria-live="polite" aria-atomic="true">{fa(quantity)}</strong>
                <button type="button" disabled={busy || quantity >= maximum} aria-label={faContent.increaseQuantity}
                  onClick={() => setQuantity((value) => Math.min(maximum, value + 1))}>
                  <Plus size={18} />
                </button>
              </div>
              <button className={`button ${detail.continueButton}`} disabled={purchaseDisabled || busy} onClick={continueBooking}>
                {faContent.continue + " "}<ArrowLeft size={17} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}
