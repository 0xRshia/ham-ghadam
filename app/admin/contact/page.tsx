"use client";
import { faContent } from "@/locales/domain-fa";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Clock3, Mail, Phone } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { useAuth } from "@/components/event/auth-context";
import { Blank, ErrorBox, Loading } from "@/components/event/shared";
import { AdminNav } from "@/components/content/admin-nav";
import styles from "@/components/content/admin-pages.module.css";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { api } from "@/lib/client";
import { date, fa } from "@/lib/types";

type MessageItem = { id: string; name: string; email: string | null; phone: string | null; subject: string; message: string; status: string; created_at: number };
type Result = { items: MessageItem[]; total: number; page: number; totalPages: number; status: string };
const labels: Record<string, string> = { new: faContent.newMessage, in_progress: faContent.inProgress, resolved: faContent.closed };

export default function AdminContact() {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState("new");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setError("");
    try { const response = await api<Result>(`/api/admin/contact?status=${status}&page=${page}`); if (version === requestVersion.current) setResult(response); }
    catch (cause) { if (version === requestVersion.current) setError((cause as Error).message); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [status, page]);
  useEffect(() => { if (!user?.isAdmin) return; const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [user?.id, user?.isAdmin, authLoading, load]);
  async function move(item: MessageItem, next: string) {
    setSaving(item.id); setError("");
    try { await api(`/api/admin/contact/${encodeURIComponent(item.id)}`, { status: next }, "PATCH"); await load(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setSaving(""); }
  }
  if (authLoading) return <main className="container subpage"><Loading variant="host" /></main>;
  if (!user?.isAdmin) return <main className="container subpage"><Blank title={faContent.adminAccessRequired} description={faContent.contactAdminOnly}><AppLink className="button" href="/admin/login">{faContent.adminLogin}</AppLink></Blank></main>;
  if (loading && !result) return <main className="container subpage"><Loading variant="host" /></main>;
  return <main className={`container ${styles.adminPage}`}>
    <AdminNav active="/admin/contact" />
    <header className={styles.adminHeading}><div><span className="eyebrow">{faContent.messageFollowup}</span><h1>{faContent.contactMessages}</h1><p>{faContent.contactMessagesHint}</p></div></header>
    <div className={styles.adminControls}><label htmlFor="contact-status">{faContent.status}</label><select id="contact-status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="new">{faContent.newMessage}</option><option value="in_progress">{faContent.inProgress}</option><option value="resolved">{faContent.closed}</option></select><span>{fa(result?.total ?? 0)} {" " + faContent.message}</span></div>
    {error && <ErrorBox message={error} retry={() => void load()} />}
    {result?.items.length ? <section className={styles.adminTable}>{result.items.map((item) => <article className={styles.adminCard} key={item.id}>
      <div className={styles.adminRow}><div><h2>{item.subject}</h2><p>{item.name} · {date(item.created_at, true)}</p></div><span>{labels[item.status] ?? item.status}</span></div>
      <p className={styles.messageBody}>{item.message}</p>
      <div className={styles.messageMeta}>{item.email && <a href={`mailto:${item.email}`}><Mail size={14} />{item.email}</a>}{item.phone && <a href={`tel:${item.phone}`}><Phone size={14} />{item.phone}</a>}</div>
      <div className={styles.adminActions}>
        {item.status === "new" && <button className="button outline" disabled={saving === item.id} onClick={() => void move(item, "in_progress")}><Clock3 size={16} />{faContent.startFollowup}</button>}
        {item.status !== "resolved" && <button className="button" disabled={saving === item.id} onClick={() => void move(item, "resolved")}><Check size={16} />{faContent.closeMessage}</button>}
        {item.status === "resolved" && <button className="button outline" disabled={saving === item.id} onClick={() => void move(item, "in_progress")}><Clock3 size={16} />{faContent.reopen}</button>}
      </div>
    </article>)}</section> : !loading && <Blank title={faContent.noMessagesInState} description={faContent.newMessagesHint} />}
    {result && <NumberedPagination page={result.page} totalPages={result.totalPages} onPageChange={setPage} disabled={loading} />}
  </main>;
}
