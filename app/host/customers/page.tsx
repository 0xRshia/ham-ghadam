"use client";
import { faContent } from "@/locales/domain-fa";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Search, Users } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { useAuth } from "@/components/event/auth-context";
import { Blank, ErrorBox, Loading } from "@/components/event/shared";
import { api } from "@/lib/client";
import { date, fa, faDigits } from "@/lib/types";
import { NumberedPagination } from "@/components/ui/numbered-pagination";

type Customer = {
  user_id: string;
  name: string;
  phone: string;
  booking_name: string;
  booking_phone: string;
  purchase_count: number;
  demo_count: number;
  spend: number;
  last_purchase: number;
  notes: string;
  tags: string[];
};
type CustomerPage = {
  customers: Customer[];
  total: number;
  page: number;
  totalPages: number;
};
type History = {
  id: string;
  title: string;
  starts_at: number;
  created_at: number;
  quantity: number;
  total: number;
  attendee_name: string;
  payment_state: string;
  sample: number;
  is_demo: number;
};
export default function HostCustomers() {
  const { user } = useAuth();
  return <HostCustomersSession key={user?.id ?? "guest"} />;
}
function HostCustomersSession() {
  const { user, loading: authLoading } = useAuth();
  const [page, setPage] = useState(1),
    [query, setQuery] = useState(""),
    [data, setData] = useState<CustomerPage | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Customer | null>(null),
    [history, setHistory] = useState<History[]>([]),
    [notes, setNotes] = useState(""),
    [tags, setTags] = useState(""),
    [saving, setSaving] = useState(false);
  const version = useRef(0);
  const load = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      const id = ++version.current;
      try {
        const result = await api<CustomerPage>(
          `/api/host/customers?page=${page}&q=${encodeURIComponent(query)}`,
        );
        if (id === version.current && isCurrent()) setData(result);
      } catch (e) {
        if (id === version.current && isCurrent())
          setError((e as Error).message);
      } finally {
        if (id === version.current && isCurrent()) setLoading(false);
      }
    },
    [page, query],
  );
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled && user?.isHost) void load(() => !cancelled);
    });
    return () => {
      cancelled = true;
    };
  }, [load, user]);
  async function openCustomer(customer: Customer) {
    setSelected(customer);
    setNotes(customer.notes);
    setTags(customer.tags.join(", "));
    try {
      const result = await api<{ history: History[] }>(
        `/api/host/customers/${encodeURIComponent(customer.user_id)}`,
      );
      setHistory(result.history);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await api("/api/host/customers", {
        userId: selected.user_id,
        notes,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      await load();
      setSelected((value) =>
        value
          ? {
              ...value,
              notes,
              tags: tags
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
            }
          : null,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  if (authLoading || (user?.isHost && loading && !data))
    return (
      <main className="container subpage">
        <Loading variant="host" />
      </main>
    );
  if (!user?.isHost)
    return (
      <main className="container subpage">
        <Blank
          title={faContent.hostAccessRequired}
          description={faContent.customersLoginHint}
        >
          <AppLink className="button" href="/host/login">
            {faContent.hostLogin}</AppLink>
        </Blank>
      </main>
    );
  return (
    <main className="container subpage host-crm">
      <header className="page-heading host-heading">
        <div>
          <div className="eyebrow">{faContent.relationshipsEyebrow}</div>
          <h1>{faContent.customers}</h1>
          <p>
            {faContent.customersHint}</p>
        </div>
        <AppLink className="button outline" href="/host">
          <Users size={17} />
          {faContent.backToDashboard}</AppLink>
      </header>
      {error && <ErrorBox message={error} retry={() => void load()} />}
      <section className="host-attendees-panel">
        <div className="host-attendee-toolbar">
          <label className="host-attendee-search">
            <Search size={18} />
            <input
              aria-label={faContent.searchCustomer}
              placeholder={faContent.nameOrPhone}
              value={query}
              onChange={(event) => {
                setLoading(true);
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <a
            className="button outline"
            href={`/api/host/customers/export?q=${encodeURIComponent(query)}`}
          >
            <Download size={17} />
            {faContent.exportAllResults}</a>
        </div>
        <p className="host-attendee-count">
          {fa(data?.total ?? 0)} {" " + faContent.customersSortHint}</p>
        {data?.customers.length ? (
          <div className="table-scroll">
            <table className="host-customer-table">
              <thead>
                <tr>
                  <th>{faContent.customer}</th>
                  <th>{faContent.accountPhone}</th>
                  <th>{faContent.lastPurchase}</th>
                  <th>{faContent.reservations}</th>
                  <th>{faContent.test}</th>
                  <th>{faContent.actualPayment}</th>
                  <th>{faContent.information}</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((customer) => (
                  <tr key={customer.user_id}>
                    <td>
                      {customer.name || customer.booking_name || faContent.unnamed}
                      <small>
                        {faContent.bookingNameLabel + " "}{customer.booking_name || "—"}
                      </small>
                    </td>
                    <td>
                      <bdi>
                        {faDigits(
                          customer.phone || customer.booking_phone || "",
                        )}
                      </bdi>
                    </td>
                    <td>
                      {customer.last_purchase
                        ? date(customer.last_purchase)
                        : "—"}
                    </td>
                    <td>{fa(customer.purchase_count)}</td>
                    <td>
                      {customer.demo_count ? (
                        <span className="demo-badge">
                          {fa(customer.demo_count)} {" " + faContent.test}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{fa(customer.spend)} {" " + faContent.toman}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => void openCustomer(customer)}
                      >
                        {faContent.customerFile}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Blank
            title={query ? faContent.noResults : faContent.noCustomers}
            description={
              query
                ? faContent.tryAnotherQuery
                : faContent.customersEmptyHint
            }
          />
        )}
        {data && (
          <NumberedPagination
            page={data.page}
            totalPages={data.totalPages}
            onPageChange={(next) => {
              setLoading(true);
              setPage(next);
            }}
            disabled={loading}
          />
        )}
      </section>
      {selected && (
        <section className="host-attendees-panel host-customer-profile">
          <div className="page-heading">
            <div>
              <h2>
                {selected.name || selected.booking_name || faContent.customerProfile}
              </h2>
              <p>
                <bdi>
                  {faDigits(selected.phone || selected.booking_phone || "")}
                </bdi>
              </p>
            </div>
            <button className="text-button" onClick={() => setSelected(null)}>
              {faContent.close}</button>
          </div>
          <div className="host-customer-fields">
            <label>
              {faContent.privateNote}<textarea
                maxLength={2000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            <label>
              {faContent.commaSeparatedTags}<input
                maxLength={400}
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
            </label>
            <button
              className="button"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? faContent.saving : faContent.saveNoteTags}
            </button>
          </div>
          <h3>{faContent.purchaseHistory}</h3>
          {history.length ? (
            <ul className="host-customer-history">
              {history.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <span>
                    {date(item.created_at)} · {fa(item.quantity)} {" " + faContent.peopleSeparator}{" "}
                    {fa(item.total)} {" " + faContent.toman}</span>
                  {item.is_demo === 1 && (
                    <small className="demo-badge">
                      {faContent.testBookingIncomeHint}</small>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>{faContent.noPurchaseHistory}</p>
          )}
        </section>
      )}
    </main>
  );
}
