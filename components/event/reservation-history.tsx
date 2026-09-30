"use client";
import { faContent, faMessages } from "@/locales/domain-fa";
import { useSearchParams } from "next/navigation";
import { AppLink } from "@/components/event/app-navigation";
import { AnimatedRegion } from "@/components/ui/animated-region";
import { ButtonLabel } from "@/components/ui/button-label";
import { LoadingPage } from "@/components/event/loading";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  Ticket,
  UserRound,
  LogOut,
  MapPin,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent, TabsPanels } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuth } from "@/components/event/auth-context";
import { Blank, ErrorBox, Loading } from "@/components/event/shared";
import { api } from "@/lib/client";
import { date, clock, fa, faDigits, type Reservation } from "@/lib/types";
import { TicketDownload } from "@/components/event/ticket-download";
import { ReceiptActions } from "@/components/event/receipt-actions";
import { eventLocationUrl } from "@/lib/location-url";
import { groupReservations } from "@/lib/reservation-history";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { reservationAmountLabel, reservationStatusLabel } from "@/lib/account-types";
import { useDeadlineClock } from "@/hooks/use-deadline-clock";
import styles from "@/components/event/ticket-download.module.css";
import layouts from "@/components/event/page-layouts.module.css";
export function ReservationHistory({ account = false, embedded = false }: { account?: boolean; embedded?: boolean }) {
  const { user } = useAuth();
  return <Suspense fallback={embedded ? <section className={`container subpage ${layouts.page}`}><Loading variant="reservations" /></section> : <LoadingPage variant={account ? "account" : "reservations"} />}>
    <ReservationHistoryContent key={user?.id ?? "signed-out"} account={account} embedded={embedded} />
  </Suspense>;
}

function ReservationHistoryContent({ account, embedded }: { account: boolean; embedded: boolean }) {
  const search = useSearchParams();
  const payment = search.has("booked") ? "booked" : (search.get("payment") ?? "");
  const purchasedId = search.get("booked") || search.get("reservation") || "";
  const returnTo = `${account ? "/account" : "/reservations"}${search.size ? `?${search}` : ""}`;
  const { user, loading: authLoading, logout, loggingOut } = useAuth();
  const requestVersion = useRef(0);
  const mounted = useRef(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [serverNow, setServerNow] = useState<number>();
  const [rows, setRows] = useState<Reservation[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [cancel, setCancel] = useState<string | null>(null),
    [busy, setBusy] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const currentTime = useDeadlineClock(undefined, 1000, serverNow);
  const Container = embedded ? "section" : "main";
  const load = useCallback(() => {
    const version = ++requestVersion.current;
    return api<{ items: Reservation[]; totalPages: number; serverNow?: number }>(`/api/reservations?page=${page}&pageSize=10`).then((result) => {
      if (!mounted.current || version !== requestVersion.current) return;
      setRows(result.items);
      setTotalPages(result.totalPages);
      if (result.serverNow !== undefined) setServerNow(result.serverNow);
      setHasLoaded(true);
    }).catch((error: Error) => {
      if (mounted.current && version === requestVersion.current) setError(error.message);
    }).finally(() => {
      if (mounted.current && version === requestVersion.current) setLoading(false);
    });
  }, [page]);
  useEffect(() => {
    mounted.current = true;
    if (user) void load();
    return () => { mounted.current = false; };
  }, [user, load]);
  async function action(id: string, kind: string) {
    if (busy) return;
    setBusy(id);
    setBusyAction(kind);
    try {
      const result = await api<{ paymentUrl?: string }>(
        `/api/reservations/${id}`,
        { action: kind },
      );
      if (!mounted.current) return;
      if (result.paymentUrl) {
        window.location.assign(result.paymentUrl);
        return;
      }
      toast.success(
        kind === "cancel" ? faContent.reservationCancelled : faContent.paymentUpdated,
      );
      setLoading(true);
      setError("");
      await load();
    } catch (e) {
      if (mounted.current) toast.error((e as Error).message);
    } finally {
      if (mounted.current) {
        setBusy("");
        setBusyAction("");
        setCancel(null);
      }
    }
  }
  if (currentTime === null) return <Container data-motion-group className={`container subpage ${layouts.page} ${layouts.reservationsPage}`}><Loading variant="reservations" /></Container>;
  const now = currentTime;
  const { past, upcoming, cancelled } = groupReservations(rows, now);
  const purchased = rows.find((r) => r.id === purchasedId && r.status === "confirmed");
  function status(r: Reservation) {
    return reservationStatusLabel(r.status, r.payment_state, r.total,
      r.status === "hold" ? (r.expires_at ?? 0) : r.ends_at, now);
  }
  function list(items: Reservation[]) {
    return items.length ? (
      <div data-motion-group className={`reservation-list ${layouts.reservationList}`}>
        {items.map((r) => {
          const locationUrl = eventLocationUrl(r);
          return (
          <article className={`reservation-card ${layouts.ticketCard}`} key={r.id}>
            {r.image && <img className={layouts.ticketImage} src={r.image} alt={faMessages.imageAlt(String(r.title))} />}
            <div className={`reservation-info ${layouts.ticketInfo}`}>
              <div className={layouts.ticketHeader}>
                <span className={`status ${r.status === "confirmed" ? "success" : ""}`}>
                  {status(r)}
                </span>
                {r.total === 0 &&
                  r.status === "confirmed" &&
                  r.starts_at > now && (
                    <button
                      type="button"
                      className={layouts.ticketCancel}
                      onClick={() => setCancel(r.id)}
                    >
                      {faContent.cancelReservation}</button>
                  )}
              </div>
              <AppLink href={`/events/${r.event_id}`}>
                <h2>{r.title}</h2>
              </AppLink>
              <p>
                {date(r.starts_at)}{faContent.timeSeparator + " "}{clock(r.starts_at)}
              </p>
              <p>{r.venue}</p>
              <div className="reservation-meta">
                <span>{fa(r.quantity)} {" " + faContent.person}</span>
                <strong>{reservationAmountLabel(r.status, r.payment_state, r.total)}</strong>
              </div>
              {r.status === "hold" && (r.expires_at ?? 0) > now && <p className="hold-countdown" role="timer" aria-live="off">{faContent.paymentDeadline + " "}{fa(Math.ceil(((r.expires_at ?? now) - now) / 1000))} {" " + faContent.seconds}</p>}
              {r.reference && (
                <p className="ticket-code">
                  {faContent.paymentReferenceLabel + " "}<bdi>{r.reference}</bdi>
                </p>
              )}
              {r.payment_state === "skipped_dev" && (
                <p className="notice">{faContent.testReservationHint}</p>
              )}
              {r.status === "paid_unfulfilled" && (
                <p className="notice">
                  {faContent.paidWithoutCapacity}</p>
              )}
            </div>
            <div className={`reservation-actions ${layouts.ticketActions}`}>
              {r.status === "confirmed" && (
                <TicketDownload reservationId={r.id} quantity={r.quantity} fullWidth />
              )}
              {(r.status === "confirmed" || r.status === "paid_unfulfilled") && <ReceiptActions reservationId={r.id} />}
              {locationUrl && (
                <a className="button outline reservation-location" href={locationUrl} target="_blank" rel="noopener noreferrer">
                  <MapPin size={17} aria-hidden="true" />
                  {faContent.viewAddress}</a>
              )}
              {r.total > 0 &&
                r.status === "hold" &&
                (r.expires_at ?? 0) > now && (
                  <button
                    className="button"
                    disabled={!!busy}
                    aria-busy={busy === r.id && busyAction === "retry"}
                    onClick={() => action(r.id, "retry")}
                  >
                    <ButtonLabel busy={busy === r.id && busyAction === "retry"} pending={faContent.preparing}>{faContent.continuePayment}</ButtonLabel>
                  </button>
                )}
              {r.total > 0 &&
                r.status !== "confirmed" &&
                r.status !== "paid_unfulfilled" && (
                  <button
                    className="button outline"
                    disabled={!!busy}
                    aria-busy={busy === r.id && busyAction === "verify"}
                    onClick={() => action(r.id, "verify")}
                  >
                    <RefreshCw size={16} />
                    <ButtonLabel busy={busy === r.id && busyAction === "verify"} pending={faContent.checking}>{faContent.checkPayment}</ButtonLabel>
                  </button>
                )}
              {r.status === "hold" && (r.expires_at ?? 0) <= now && (
                <AppLink href={`/events/${r.event_id}`} className="text-button">
                  {faContent.reserveAgain}</AppLink>
              )}
            </div>
          </article>
          );
        })}
      </div>
    ) : (
      <Blank
        title={faContent.noReservationsTitle}
        description={faContent.noReservationsHint}
      >
        <AppLink className="button" href="/">
          {faContent.discoverEvents}<ArrowLeft size={17} />
        </AppLink>
      </Blank>
    );
  }
  return (
    <Container data-motion-group className={`container subpage ${layouts.page} ${layouts.reservationsPage}`}>
      <div className={`page-heading ${layouts.pageHeading}`}>
        <div className="eyebrow">
          <Ticket size={17} />
          {faContent.yourMeetups}</div>
        <h1>{account ? faContent.account : faContent.myTickets}</h1>
        <p>{faContent.yourMeetupsHint}</p>
      </div>
      {account && user && (
        <section className={layouts.accountProfile} aria-label={faContent.accountInformation}>
          <div className={layouts.accountIdentity}>
            <span className={layouts.accountAvatar}><UserRound size={28} aria-hidden="true" /></span>
            <div>
              <h2>{user.name || faContent.yourAccount}</h2>
              <p>{faContent.mobile + " "}<bdi>{faDigits(user.phone)}</bdi></p>
            </div>
          </div>
          <button className="button outline" type="button" onClick={logout} disabled={loggingOut} aria-busy={loggingOut}>
            <LogOut size={17} aria-hidden="true" />
            <ButtonLabel busy={loggingOut} pending={faContent.loggingOut}>{faContent.logout}</ButtonLabel>
          </button>
        </section>
      )}
      {account && user && <h2 className={layouts.accountHistoryTitle}>{faContent.ticketsMeetups}</h2>}
      {user && !loading && !error && purchased && (
        <section className={styles.purchase} aria-labelledby="tickets-ready-heading">
          <CheckCircle2 size={27} />
          <div>
            <h2 id="tickets-ready-heading">{faContent.ticketReady}</h2>
            <p>{purchased.title} {" " + faContent.ticketsSavedHint}</p>
            <TicketDownload reservationId={purchased.id} quantity={purchased.quantity} prominent />
          </div>
        </section>
      )}
      {payment && !purchased && (
        <div
          className={
            payment === "success" || payment === "booked"
              ? "success-box"
              : "notice"
          }
          role="status"
        >
          {payment === "success" || payment === "booked" ? (
            faContent.purchaseResultHint
          ) : payment === "cancelled" ? (
            faContent.paymentReturnHint
          ) : payment === "review" ? (
            faContent.paymentHostFollowup
          ) : (
            faContent.paymentVerificationPending
          )}
        </div>
      )}
      <AnimatedRegion animateHeight={false} aria-busy={hasLoaded && loading} transitionKey={authLoading || (!!user && loading && !hasLoaded) ? "loading" : !user ? "signed-out" : error || rows.map((row) => `${row.id}:${row.status}`).join(",")}>
      {authLoading || (!!user && loading && !hasLoaded) ? (
        <Loading variant="reservations" />
      ) : !user ? (
        <Blank
          title={faContent.ticketsAwaiting}
          description={faContent.loginReservationsHint}
        >
          <AppLink className="button" href={`/login?next=${encodeURIComponent(returnTo)}`}>
            {faContent.accountLogin}<ArrowLeft size={17} />
          </AppLink>
        </Blank>
      ) : error ? (
        <ErrorBox message={error} retry={() => { setLoading(true); setError(""); void load(); }} />
      ) : (
        <Tabs defaultValue={purchased && past.includes(purchased) ? "past" : "upcoming"} dir="rtl">
          <TabsList className="page-tabs">
            <TabsTrigger value="past">
              {faContent.pastOpenParenthesis}{fa(past.length)})
            </TabsTrigger>
            <TabsTrigger value="upcoming">
              {faContent.upcomingOpenParenthesis}{fa(upcoming.length)})
            </TabsTrigger>
            <TabsTrigger value="cancelled">
              {faContent.cancelledOpenParenthesis}{fa(cancelled.length)})
            </TabsTrigger>
          </TabsList>
          <TabsPanels>
          <TabsContent value="past">{list(past)}</TabsContent>
          <TabsContent value="upcoming">{list(upcoming)}</TabsContent>
          <TabsContent value="cancelled">{list(cancelled)}</TabsContent>
        </TabsPanels>
        </Tabs>
      )}
      </AnimatedRegion>
      {user && !loading && !error && totalPages > 1 && <NumberedPagination page={page} totalPages={totalPages} onPageChange={(nextPage) => { setLoading(true); setPage(nextPage); }} disabled={loading} />}
      <AlertDialog
        open={!!cancel}
        onOpenChange={(v) => {
          if (!v && !busy) setCancel(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{faContent.cancelReservationTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {faContent.cancelReservationHint}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{faContent.keepReservation}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!busy}
              aria-busy={!!busy && busyAction === "cancel"}
              onClick={() => cancel && action(cancel, "cancel")}
            >
              <ButtonLabel busy={!!busy && busyAction === "cancel"} pending={faContent.cancelling}>{faContent.cancelReservation}</ButtonLabel>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Container>
  );
}
