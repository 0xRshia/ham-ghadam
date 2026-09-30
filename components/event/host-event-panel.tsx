"use client";
import { faContent, faMessages } from "@/locales/domain-fa";
import { copy } from "@/locales/fa";
import layouts from "@/components/event/page-layouts.module.css";
import { ButtonLabel } from "@/components/ui/button-label";
import { AppLink, useAppNavigate } from "./app-navigation";
import { AnimatedRegion } from "@/components/ui/animated-region";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCheck,
  Copy,
  Download,
  MapPin,
  RefreshCw,
  ScanLine,
  Search,
  Share2,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/event/auth-context";
import { Blank, ErrorBox, Loading } from "@/components/event/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/client";
import { clock, date, fa, faDigits, type EventItem } from "@/lib/types";

type HostEventData = {
  event: EventItem;
  attendees: {
    id: string;
    event_id: string;
    quantity: number;
    total: number;
    status: string;
    payment_state: string;
    created_at: number;
    name: string;
    phone: string;
    checkedIn: number;
  }[];
  attendeeTotal: number;
  page: number;
  stats: { people: number; bookings: number; checkedIn: number; revenue: number };
};

const PAGE_SIZE = 50;

export default function HostEventPanel({ id }: { id: string }) {
  const navigate = useAppNavigate();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<HostEventData | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [scannerUrl, setScannerUrl] = useState("");
  const [scannerBusy, setScannerBusy] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [nativeShareAvailable, setNativeShareAvailable] = useState(false);
  const [rotateConfirm, setRotateConfirm] = useState(false);
  const eventPath = `/api/host/events/${encodeURIComponent(id)}`;

  useEffect(() => {
    if (!user?.isHost) return;
    let ignore = false;
    const timer = window.setTimeout(() => {
      api<HostEventData>(
        `${eventPath}?${new URLSearchParams({ q: query.trim(), page: String(page) })}`,
      )
        .then((result) => {
          if (!ignore) {
            setData(result);
            setError("");
          }
        })
        .catch((reason: Error) => {
          if (!ignore) setError(reason.message);
        })
        .finally(() => {
          if (!ignore) setLoading(false);
        });
    }, query ? 250 : 0);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [eventPath, user?.isHost, user?.id, query, page, revision]);

  function reload() {
    setLoading(true);
    setError("");
    setRevision((value) => value + 1);
  }

  function search(value: string) {
    if (value === query && page === 0) return;
    setQuery(value);
    setPage(0);
    setLoading(true);
    setError("");
  }

  function changePage(value: number) {
    setPage(value);
    setLoading(true);
    setError("");
  }

  async function exportAttendees() {
    setExporting(true);
    try {
      const response = await fetch(
        `${eventPath}/export?${new URLSearchParams({ q: query.trim() })}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          result?.error || faContent.attendeeFetchFailed,
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `hamghadam-attendees-${id}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(faContent.attendeeFileReady);
    } catch (reason) {
      toast.error(
        reason instanceof Error
          ? reason.message
          : faContent.fileDownloadFailed,
      );
    } finally {
      setExporting(false);
    }
  }

  async function getScannerUrl(rotate = false) {
    if (scannerUrl && !rotate) return scannerUrl;
    setScannerBusy(true);
    setScannerError("");
    try {
      const result = await api<{ scannerUrl: string }>(`${eventPath}/scanner`, {
        ...(rotate ? { action: "rotate" } : {}),
      });
      const url = new URL(result.scannerUrl, window.location.origin).href;
      setScannerUrl(url);
      return url;
    } catch (reason) {
      setScannerError((reason as Error).message);
      return null;
    } finally {
      setScannerBusy(false);
    }
  }

  function openShareMenu() {
    setNativeShareAvailable(typeof navigator.share === "function");
    setRotateConfirm(false);
    setShareOpen(true);
    void getScannerUrl();
  }

  async function copyScannerLink() {
    const url = await getScannerUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(faContent.scannerLinkCopied);
    } catch {
      setNativeShareAvailable(typeof navigator.share === "function");
      setShareOpen(true);
      toast.error(faContent.scannerManualCopy);
    }
  }

  async function shareScanner() {
    if (!scannerUrl || !data) return;
    try {
      await navigator.share({
        title: faMessages.scannerTitle(String(data.event.title)),
        text: faMessages.scannerDescription(String(data.event.title)),
        url: scannerUrl,
      });
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") return;
      toast.error(faContent.scannerShareFailed);
    }
  }

  async function rotateScannerLink() {
    const url = await getScannerUrl(true);
    if (url) {
      setRotateConfirm(false);
      toast.success(faContent.scannerLinkRotated);
    }
  }

  const backLink = (
    <AppLink className="back-link" href="/host">
      <ArrowRight size={17} /> {" " + faContent.backToHostPanel}</AppLink>
  );

  if (authLoading)
    return (
      <main data-motion-group className={`container subpage ${layouts.page} ${layouts.workspace}`}>
        {backLink}
        <Loading variant="host-event" />
      </main>
    );

  if (!user?.isHost)
    return (
      <main data-motion-group className={`container subpage ${layouts.page} ${layouts.workspace}`}>
        {backLink}
        <Blank
          title={
            user ? faContent.eventHostOnly : faContent.signInAsHost
          }
          description={faContent.eventHostAccessHint}
        >
          {!user && (
            <AppLink className="button" href="/host/login">{faContent.hostLogin}</AppLink>
          )}
        </Blank>
      </main>
    );

  if (!data)
    return (
      <main data-motion-group className={`container subpage ${layouts.page} ${layouts.workspace}`}>
        {backLink}
        {error ? <ErrorBox message={error} retry={reload} /> : <Loading variant="host-event" />}
      </main>
    );

  return (
    <main data-motion-group className={`container subpage host-event-panel ${layouts.page} ${layouts.workspace}`}>
      {backLink}
      <div className={`page-heading host-heading ${layouts.pageHeading}`}>
        <div>
          <div className="eyebrow">{faContent.manageMeetup}</div>
          <h1>{data.event.title}</h1>
          <div className="host-event-meta">
            <span>
              <CalendarDays size={16} /> {date(data.event.starts_at)}{faContent.timeSeparator}{" "}
              {clock(data.event.starts_at)}
            </span>
            <span><MapPin size={16} /> {data.event.venue}</span>
          </div>
        </div>
        <AppLink
          className="button outline"
          href={`/events/${encodeURIComponent(id)}`}
        >
          {faContent.viewEventPage}</AppLink>
      </div>

      <AppLink className="button outline" href={`/host/events/${encodeURIComponent(id)}/tiers`}>{copy.manageTiers}</AppLink>
      <AppLink className="button outline" href={`/host/events/${encodeURIComponent(id)}/program`}>{copy.manageProgram}</AppLink>
      <div data-motion-group className="stats-grid">
        {[
          {
            label: faContent.confirmedTickets,
            value: data.stats.people,
            unit: faContent.ticket,
            Icon: Ticket,
          },
          {
            label: faContent.admitted,
            value: data.stats.checkedIn,
            unit: faContent.person,
            Icon: CheckCheck,
          },
          {
            label: faContent.confirmedPurchases,
            value: data.stats.bookings,
            unit: faContent.purchase,
            Icon: Users,
          },
          {
            label: faContent.eventSales,
            value: data.stats.revenue,
            unit: faContent.toman,
            Icon: Wallet,
          },
        ].map(({ label, value, unit, Icon }) => (
          <div className="stat-card" key={label}>
            <div>
              <span>{label}</span><Icon size={21} />
            </div>
            <strong>{fa(value)}<small>{unit}</small></strong>
          </div>
        ))}
      </div>

      <section
        className="host-scanner-panel"
        aria-labelledby="host-scanner-heading"
      >
        <div className="host-section-heading">
          <div className="host-scanner-symbol"><ScanLine size={28} /></div>
          <div>
            <h2 id="host-scanner-heading">{faContent.scannerWelcomeHeading}</h2>
            <p>{faContent.scannerStaffHint}</p>
          </div>
        </div>
        <div className="host-scanner-actions">
          {scannerUrl ? (
            <AppLink className="button" href={scannerUrl} rel="noreferrer">
              <ScanLine size={18} /> {" " + faContent.openScanner}</AppLink>
          ) : (
            <button
              className="button"
              disabled={scannerBusy}
              aria-busy={scannerBusy}
              onClick={async () => {
                const url = await getScannerUrl();
                if (url) navigate(url);
              }}
            >
              <ScanLine size={18} />{" "}
              <ButtonLabel busy={scannerBusy} pending={faContent.preparing}>{faContent.openScanner}</ButtonLabel>
            </button>
          )}
          <button
            className="button outline"
            disabled={scannerBusy}
            aria-busy={scannerBusy}
            onClick={() => void copyScannerLink()}
          >
            <Copy size={17} /> <ButtonLabel busy={scannerBusy} pending={faContent.preparing}>{faContent.copyScannerLink}</ButtonLabel>
          </button>
          <button
            className="button outline"
            disabled={scannerBusy}
            aria-busy={scannerBusy}
            onClick={openShareMenu}
          >
            <Share2 size={17} /> <ButtonLabel busy={scannerBusy} pending={faContent.preparing}>{faContent.shareScanner}</ButtonLabel>
          </button>
        </div>
        <ol className="host-scanner-instructions">
          <li>
            {faContent.scannerOpenInstructions}</li>
          <li>
            {faContent.scannerQrInstructions}</li>
          <li>
            {faContent.scannerAdmissionInstructions}</li>
        </ol>
        <p className="host-scanner-access">
          {faContent.scannerStaffAccessHint}</p>
        {scannerError && <ErrorBox message={scannerError} />}
      </section>

      <section
        data-motion-group
        className="host-attendees-panel"
        aria-labelledby="host-attendees-heading"
      >
        <div className="host-section-heading host-attendees-heading">
          <div>
            <h2 id="host-attendees-heading">{faContent.attendeeList}</h2>
            <p>
              {faContent.attendeeListHint}</p>
          </div>
          <button className="text-button" disabled={loading} onClick={reload}>
            <RefreshCw size={16} /> {" " + faContent.refresh}</button>
        </div>
        <div className="host-attendee-toolbar">
          <label className="host-attendee-search">
            <span className="sr-only">{faContent.attendeeSearch}</span>
            <Search size={19} aria-hidden="true" />
            <input
              type="search"
              value={query}
              maxLength={100}
              onChange={(event) => search(event.target.value)}
              placeholder={faContent.attendeeSearch}
            />
          </label>
          <button
            className="button outline"
            disabled={exporting || loading || !!error || !data.attendeeTotal}
            onClick={() => void exportAttendees()}
          >
            <Download size={17} />{" "}
            <ButtonLabel busy={exporting} pending={faContent.downloading}>{faContent.downloadAttendeeCsv}</ButtonLabel>
          </button>
        </div>
        <p className="host-attendee-count" aria-live="polite">
          {loading
            ? faContent.loadingAttendees
            : error
              ? faContent.attendeeFetchFailed
              : faMessages.attendeeExportSummary(String(fa(data.attendeeTotal)), String(query.trim() ? faContent.matchingSearchSuffix : faContent.confirmedSuffix), String(query.trim() ? faContent.thisSearch : faContent.event))}
        </p>
        <AnimatedRegion aria-busy={loading} transitionKey={error || data.attendees.map((attendee) => attendee.id).join(",")}>
          {error ? (
            <ErrorBox message={error} retry={reload} />
          ) : data.attendees.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{faContent.buyerName}</TableHead>
                  <TableHead>{faContent.mobile}</TableHead>
                  <TableHead>{faContent.ticketCount}</TableHead>
                  <TableHead>{faContent.admitted}</TableHead>
                  <TableHead>{faContent.purchaseTime}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.attendees.map((attendee) => (
                  <TableRow key={attendee.id}>
                    <TableCell>
                      <strong>{attendee.name || faContent.unnamed}</strong>
                      {attendee.payment_state === "skipped_dev" && (
                        <p className="muted">{faContent.testNoPayment}</p>
                      )}
                    </TableCell>
                    <TableCell><bdi>{faDigits(attendee.phone ?? "")}</bdi></TableCell>
                    <TableCell>{fa(attendee.quantity)}</TableCell>
                    <TableCell>
                      <span
                        className={`status${attendee.checkedIn === attendee.quantity ? " success" : ""}`}
                      >
                        {fa(attendee.checkedIn)} {" " + faContent.from + " "}{fa(attendee.quantity)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {date(attendee.created_at)}، {clock(attendee.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Blank
              title={
                query.trim()
                  ? faContent.noAttendeeMatch
                  : faContent.awaitingFirstAttendee
              }
              description={
                query.trim()
                  ? faContent.attendeeSearchHint
                  : faContent.attendeesAfterPurchase
              }
            >
              {query && (
                <button className="button outline" onClick={() => search("")}>
                  {faContent.clearSearch}</button>
              )}
            </Blank>
          )}
        </AnimatedRegion>
        {data.attendeeTotal > PAGE_SIZE && !error && (
          <nav
            className="host-attendee-pagination"
            aria-label={faContent.attendeePages}
          >
            <button
              className="button outline"
              disabled={loading || page === 0}
              onClick={() => changePage(page - 1)}
            >
              {faContent.previousPage}</button>
            <span>
              {faContent.pageOf + " "}{fa(page + 1)} {" " + faContent.from}{" "}
              {fa(Math.ceil(data.attendeeTotal / PAGE_SIZE))}
            </span>
            <button
              className="button outline"
              disabled={loading || (page + 1) * PAGE_SIZE >= data.attendeeTotal}
              onClick={() => changePage(page + 1)}
            >
              {faContent.nextPage}</button>
          </nav>
        )}
      </section>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="app-dialog host-share-dialog" dir="rtl">
          <DialogTitle>{faContent.shareScanner}</DialogTitle>
          <DialogDescription>
            {faContent.scannerEventPrefix}{data.event.title}{faContent.scannerEventSuffix}</DialogDescription>
          {scannerError && (
            <ErrorBox message={scannerError} retry={() => void getScannerUrl()} />
          )}
          {scannerUrl ? (
            <>
              <label className="host-scanner-link-label">
                {faContent.eventScannerLink}<input
                  className="host-scanner-link"
                  value={scannerUrl}
                  readOnly
                  dir="ltr"
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <div className="host-share-options">
                {nativeShareAvailable && (
                  <button
                    className="button"
                    disabled={scannerBusy}
                    onClick={() => void shareScanner()}
                  >
                    <Share2 size={17} /> {" " + faContent.chooseShareApp}</button>
                )}
                <button
                  className="button outline"
                  disabled={scannerBusy}
                  onClick={() => void copyScannerLink()}
                >
                  <Copy size={17} /> {" " + faContent.copyStaffLink}</button>
              </div>
              <div className="host-scanner-rotate">
                {rotateConfirm ? (
                  <>
                    <p>
                      {faContent.rotateScannerHint}</p>
                    <div className="host-share-options">
                      <button
                        className="button outline"
                        disabled={scannerBusy}
                        aria-busy={scannerBusy}
                        onClick={() => void rotateScannerLink()}
                      >
                        <ButtonLabel busy={scannerBusy} pending={faContent.rotatingScanner}>{faContent.rotateScannerLink}</ButtonLabel>
                      </button>
                      <button
                        className="text-button"
                        disabled={scannerBusy}
                        onClick={() => setRotateConfirm(false)}
                      >
                        {faContent.cancel}</button>
                    </div>
                  </>
                ) : (
                  <button
                    className="text-button"
                    disabled={scannerBusy}
                    onClick={() => setRotateConfirm(true)}
                  >
                    <RefreshCw size={15} /> {" " + faContent.revokeScannerAccess}</button>
                )}
              </div>
            </>
          ) : scannerBusy ? (
            <p role="status">{faContent.preparingScanner}</p>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
