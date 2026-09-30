"use client";
import { faContent, faMessages } from "@/locales/domain-fa";
import layouts from "@/components/event/page-layouts.module.css";
import { AppLink } from "@/components/event/app-navigation";
import { AnimatedRegion } from "@/components/ui/animated-region";
import { ButtonLabel } from "@/components/ui/button-label";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus,
  Users,
  Ticket,
  CalendarDays,
  Wallet,
  ArrowLeft,
  Download,
  Eye,
  EyeOff,
  BarChart3,
  MessageSquare,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TabsPanels,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { useAuth } from "@/components/event/auth-context";
import { EventForm } from "@/components/event/event-form";
import { Blank, Choice, ErrorBox, Loading } from "@/components/event/shared";
import { api } from "@/lib/client";
import {
  date,
  clock,
  fa,
  faDigits,
  type EventItem,
  type Reservation,
} from "@/lib/types";
type HostData = {
  stats: {
    revenue: number;
    people: number;
    bookings: number;
    demoPeople: number;
    demoBookings: number;
    paymentFollowups: number;
  };
  attendeeTotal: number;
  events: EventItem[];
  attendees: (Reservation & { sample?: number })[];
  sales: { day: string; sales: number; tickets: number }[];
  serverNow: number;
};
export default function Host() {
  const { user } = useAuth();
  return <HostDashboard key={user?.id ?? "signed-out"} />;
}

function HostDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [page, setPage] = useState(0),
    [activeTab, setActiveTab] = useState("events");
  const [data, setData] = useState<HostData>({
      events: [],
      attendees: [],
      sales: [],
      stats: {
        revenue: 0,
        people: 0,
        bookings: 0,
        demoPeople: 0,
        demoBookings: 0,
        paymentFollowups: 0,
      },
      attendeeTotal: 0,
      serverNow: 0,
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [selected, setSelected] = useState("all");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const filters = useRef({ page: 0, event: "all" });
  const load = useCallback(async (isCurrent: () => boolean = () => true) => {
    const version = ++requestVersion.current;
    setError("");
    setLoading(true);
    try {
      const result = await api<HostData>(
        `/api/host?page=${filters.current.page}&event=${encodeURIComponent(filters.current.event)}`,
      );
      if (version !== requestVersion.current || !isCurrent()) return;
      setData(result);
      setHasLoaded(true);
    } catch (e) {
      if (version === requestVersion.current && isCurrent())
        setError((e as Error).message);
    } finally {
      if (version === requestVersion.current && isCurrent()) setLoading(false);
    }
  }, []);
  useEffect(() => {
    filters.current = { page, event: selected };
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled && user?.isHost) void load(() => !cancelled);
    });
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, page, selected, load]);
  async function publish(e: EventItem) {
    if (publishing) return;
    setPublishing(e.id);
    try {
      await api("/api/host", {
        action: "publish",
        id: e.id,
        published: !e.published,
      });
      await load();
      toast.success(
        e.published
          ? faContent.salesStopped
          : faContent.eventPublished,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPublishing(null);
    }
  }
  // The server filters these rows; retain the last result while the next one loads.
  const attendees = data.attendees;
  const revenue = data.stats.revenue;
  const chart = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(data.serverNow - (6 - i) * 86400000);
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    return {
      label: date(+d),
      sales: data.sales.find((s) => s.day === day)?.sales ?? 0,
    };
  });
  function exportCsv() {
    const cell = (x: unknown) =>
      '"' +
      String(x ?? "")
        .replace(/^[\s\u0000-\u001f]*[=+@-]/, "'$&")
        .replace(/"/g, '""') +
      '"';
    const content =
      "\uFEFF" +
      [
        [
          faContent.event,
          faContent.name,
          faContent.mobileShort,
          faContent.quantity,
          faContent.amountToman,
          faContent.status,
          faContent.bookingCode,
        ],
        ...attendees.map((a) => [
          a.title,
          a.name,
          a.phone,
          a.quantity,
          a.total,
          a.status === "confirmed"
            ? a.payment_state === "skipped_dev" || a.sample === 1
              ? faContent.confirmedTest
              : faContent.confirmed
            : faContent.followupRequired,
          a.id,
        ]),
      ]
        .map((row) => row.map(cell).join(","))
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "hamghadam-attendees.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <main
      data-motion-group
      className={`container subpage ${layouts.page} ${layouts.workspace}`}
    >
      <div className={`page-heading host-heading ${layouts.pageHeading}`}>
        <div>
          <div className="eyebrow">{faContent.hostHomeEyebrow}</div>
          <h1>{faContent.hostPanel}</h1>
          <p>
            {user?.name ? faMessages.welcomeHost(String(user.name)) : ""}{faContent.hostPanelDescription}</p>
        </div>
        {user?.isHost && (
          <button
            className="button"
            onClick={() => {
              setOpen(true);
            }}
          >
            <Plus size={19} />
            {faContent.newEvent}</button>
        )}
      </div>
      <AnimatedRegion
        animateHeight={false}
        aria-busy={hasLoaded && loading}
        transitionKey={
          authLoading || (loading && !hasLoaded)
            ? "loading"
            : !user
              ? "signed-out"
              : user.isHost
                ? "host"
                : "not-host"
        }
      >
        {authLoading || (user?.isHost && loading && !hasLoaded) ? (
          <Loading variant="host" />
        ) : !user ? (
          <Blank
            title={faContent.hostWelcomeTitle}
            description={faContent.hostWelcomeDescription}
          >
            <AppLink className="button" href="/host/login">
              {faContent.hostLogin}<ArrowLeft size={17} />
            </AppLink>
          </Blank>
        ) : !user.isHost ? (
          <Blank
            title={faContent.hostNotAuthorized}
            description={faContent.hostAuthorizationHint}
          >
            <AppLink className="button outline" href="/">
              {faContent.backToEvents}</AppLink>
          </Blank>
        ) : error ? (
          <ErrorBox message={error} retry={load} />
        ) : (
          <>
            <div data-motion-group className="stats-grid">
              {[
                {
                  label: faContent.totalSales,
                  value: fa(revenue),
                  unit: faContent.toman,
                  Icon: Wallet,
                },
                {
                  label: faContent.attendees,
                  value: fa(data.stats.people),
                  unit: faContent.person,
                  caption: data.stats.demoPeople
                    ? faMessages.testPeopleCount(String(fa(data.stats.demoPeople)))
                    : undefined,
                  Icon: Users,
                },
                {
                  label: faContent.yourEvents,
                  value: fa(data.events.length),
                  unit: faContent.event,
                  Icon: CalendarDays,
                },
                {
                  label: faContent.confirmedReservations,
                  value: fa(data.stats.bookings),
                  unit: faContent.reservation,
                  caption: data.stats.demoBookings
                    ? faMessages.testBookingsCount(String(fa(data.stats.demoBookings)))
                    : undefined,
                  Icon: Ticket,
                },
              ].map((s) => (
                <div className="stat-card" key={s.label}>
                  <div>
                    <span>{s.label}</span>
                    <s.Icon size={21} />
                  </div>
                  <strong>
                    {s.value}
                    <small>{s.unit}</small>
                    {s.caption && (
                      <small className="demo-stat-note">{s.caption}</small>
                    )}
                  </strong>
                </div>
              ))}
            </div>
            {data.stats.paymentFollowups > 0 && (
              <div className="error-box">
                {fa(data.stats.paymentFollowups)} {" " + faContent.paidCapacityFollowup}</div>
            )}
            <div data-motion-group className="charts-grid">
              <section className="chart-panel">
                <h2>
                  <BarChart3 size={19} /> {" " + faContent.salesLastWeek + " "}<small>{faContent.toman}</small>
                </h2>
                <ChartContainer
                  className="host-chart"
                  config={{ sales: { label: faContent.sales, color: "var(--chart-1)" } }}
                >
                  <BarChart data={chart} accessibilityLayer>
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      fontSize={13}
                      tick={{ fill: "var(--text-muted)" }}
                    />
                    <YAxis
                      tickFormatter={(v) => fa(v)}
                      width={65}
                      axisLine={false}
                      tickLine={false}
                      fontSize={13}
                      tick={{ fill: "var(--text-muted)" }}
                    />
                    <Tooltip
                      formatter={(v) => [faMessages.amountWithCurrency(String(fa(Number(v)))), faContent.sales]}
                      contentStyle={{
                        direction: "rtl",
                        borderRadius: 12,
                        fontFamily: "var(--font-app)",
                        fontSize: 14,
                        backgroundColor: "var(--popover)",
                        color: "var(--popover-foreground)",
                        borderColor: "var(--border)",
                      }}
                      labelStyle={{ color: "var(--text-muted)" }}
                      itemStyle={{ color: "var(--foreground)" }}
                    />
                    <Bar
                      dataKey="sales"
                      fill="var(--color-sales)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={36}
                    />
                  </BarChart>
                </ChartContainer>
                {revenue === 0 && (
                  <p className="chart-caption">{faContent.noSales}</p>
                )}
              </section>
              <section className="chart-panel">
                <h2>
                  <Users size={19} /> {" " + faContent.registrationByEvent}</h2>
                {data.events.length ? (
                  <div className="attendance-bars">
                    {data.events.slice(0, 5).map((e) => (
                      <div key={e.id}>
                        <p>
                          <span>{e.title}</span>
                          <strong>{fa(e.attendees)} {" " + faContent.person}</strong>
                        </p>
                        <div className="bar-track">
                          <span
                            style={{
                              width: `${Math.min(100, e.capacity ? (e.attendees / e.capacity) * 100 : e.attendees ? 100 : 0)}%`,
                            }}
                          />
                        </div>
                        <small>
                          {e.capacity
                            ? faMessages.capacityPeople(String(fa(e.capacity)))
                            : faContent.unlimitedCapacityHint}
                        </small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Blank
                    title={faContent.createFirstEvent}
                    description={faContent.registrationStatsHint}
                  />
                )}
              </section>
            </div>
            <nav className="host-hub-links" aria-label={faContent.customersAndReviews}>
              <AppLink className="host-hub-link" href="/host/customers">
                <Users size={19} />
                <span>
                  <strong>{faContent.yourCustomers}</strong>
                  <small>{faContent.customerManagementDescription}</small>
                </span>
                <ArrowLeft size={17} />
              </AppLink>
              <AppLink className="host-hub-link" href="/host/reviews">
                <MessageSquare size={19} />
                <span>
                  <strong>{faContent.eventReviews}</strong>
                  <small>{faContent.reviewManagementDescription}</small>
                </span>
                <ArrowLeft size={17} />
              </AppLink>
            </nav>
            <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
              <TabsList className="page-tabs">
                <TabsTrigger value="events">
                  {faContent.eventsOpenParenthesis}{fa(data.events.length)})
                </TabsTrigger>
                <TabsTrigger value="attendees">
                  {faContent.attendeesOpenParenthesis}{fa(data.attendeeTotal)})
                </TabsTrigger>
              </TabsList>
              <TabsPanels>
                <TabsContent value="events">
                  {data.events.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{faContent.event}</TableHead>
                          <TableHead>{faContent.time}</TableHead>
                          <TableHead>{faContent.registrationCapacity}</TableHead>
                          <TableHead>{faContent.price}</TableHead>
                          <TableHead>{faContent.status}</TableHead>
                          <TableHead>{faContent.management}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.events.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell>
                              <AppLink
                                href={`/events/${e.id}`}
                                className="table-event"
                              >
                                {e.title}
                                <small>{e.venue}</small>
                              </AppLink>
                            </TableCell>
                            <TableCell>
                              {date(e.starts_at)}
                              <br />
                              {clock(e.starts_at)}
                            </TableCell>
                            <TableCell>
                              {fa(e.attendees)} /{" "}
                              {e.capacity ? fa(e.capacity) : faContent.unlimited}
                            </TableCell>
                            <TableCell>
                              {e.price ? faMessages.amountWithCurrency(String(fa(e.price))) : faContent.free}
                            </TableCell>
                            <TableCell>
                              <span
                                className={`status ${e.published ? "success" : ""}`}
                              >
                                {e.published ? faContent.published : faContent.salesStoppedLabel}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="host-event-actions">
                                <AppLink
                                  className="button outline"
                                  href={`/host/events/${encodeURIComponent(e.id)}`}
                                >
                                  <Users size={16} />
                                  {faContent.manageAttendees}</AppLink>
                                <button
                                  type="button"
                                  disabled={!!publishing || loading}
                                  aria-busy={publishing === e.id}
                                  className="text-button"
                                  onClick={() => publish(e)}
                                >
                                  <ButtonLabel
                                    state={
                                      publishing === e.id
                                        ? "pending"
                                        : e.published
                                          ? "published"
                                          : "paused"
                                    }
                                    states={{
                                      pending: faContent.saving,
                                      published: (
                                        <>
                                          <EyeOff size={16} /> {" " + faContent.stopSales}</>
                                      ),
                                      paused: (
                                        <>
                                          <Eye size={16} /> {" " + faContent.publish}</>
                                      ),
                                    }}
                                  />
                                </button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <Blank title={faContent.noHostedEvents}>
                      <button className="button" onClick={() => setOpen(true)}>
                        <Plus size={17} />
                        {faContent.createFirstEventAction}</button>
                    </Blank>
                  )}
                </TabsContent>
                <TabsContent value="attendees">
                  <div className="table-toolbar">
                    <Choice
                      label={faContent.attendeeEventFilter}
                      value={selected}
                      onChange={(v) => {
                        setSelected(v);
                        setPage(0);
                      }}
                      options={[
                        { value: "all", label: faContent.allEvents },
                        ...data.events.map((e) => ({
                          value: e.id,
                          label: e.title,
                        })),
                      ]}
                    />
                    {selected !== "all" && (
                      <AppLink
                        className="button outline"
                        href={`/host/events/${encodeURIComponent(selected)}`}
                      >
                        <Users size={16} />
                        {faContent.searchManageEvent}</AppLink>
                    )}
                    <button
                      className="button outline"
                      disabled={loading || !attendees.length}
                      onClick={exportCsv}
                    >
                      <Download size={16} />
                      {faContent.downloadCurrentPage}</button>
                  </div>
                  {attendees.length ? (
                    <AnimatedRegion
                      animateHeight={false}
                      aria-busy={loading}
                      transitionKey={data.attendees
                        .map((attendee) => attendee.id)
                        .join(",")}
                    >
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{faContent.name}</TableHead>
                            <TableHead>{faContent.mobile}</TableHead>
                            <TableHead>{faContent.event}</TableHead>
                            <TableHead>{faContent.quantity}</TableHead>
                            <TableHead>{faContent.amount}</TableHead>
                            <TableHead>{faContent.status}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {attendees.map((a) => (
                            <TableRow key={a.id}>
                              <TableCell>{a.name || faContent.unnamed}</TableCell>
                              <TableCell>
                                <bdi>{faDigits(a.phone ?? "")}</bdi>
                              </TableCell>
                              <TableCell>{a.title}</TableCell>
                              <TableCell>{fa(a.quantity)}</TableCell>
                              <TableCell>{fa(a.total)} {" " + faContent.toman}</TableCell>
                              <TableCell>
                          {a.status === "confirmed"
                            ? a.payment_state === "skipped_dev" || a.sample === 1
                              ? faContent.confirmedTest
                              : faContent.confirmed
                                  : faContent.paymentFollowupRequired}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </AnimatedRegion>
                  ) : (
                    <Blank
                      title={faContent.noAttendees}
                      description={faContent.attendeesEmptyHint}
                    />
                  )}
                  <NumberedPagination
                    page={page + 1}
                    totalPages={Math.max(1, Math.ceil(data.attendeeTotal / 50))}
                    onPageChange={(nextPage) => {
                      setLoading(true);
                      setPage(nextPage - 1);
                    }}
                    disabled={loading}
                  />
                </TabsContent>
              </TabsPanels>
            </Tabs>
          </>
        )}
      </AnimatedRegion>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!saving) setOpen(v);
        }}
      >
        <DialogContent
          className={`app-dialog event-form-dialog ${layouts.creationDialog}`}
          dir="rtl"
          showCloseButton={false}
        >
          <DialogTitle>{faContent.createEventHeading}</DialogTitle>
          <DialogDescription>
            {faContent.createEventHint}</DialogDescription>
          <EventForm
            saving={saving}
            onSavingChange={setSaving}
            onCancel={() => setOpen(false)}
            onCreated={async () => {
              setOpen(false);
              await load();
              toast.success(faContent.eventPublishedSuccess);
            }}
          />
        </DialogContent>
      </Dialog>
    </main>
  );
}
