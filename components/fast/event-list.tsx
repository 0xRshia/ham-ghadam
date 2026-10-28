"use client";
import { EventSyncControls } from "./event-sync-controls";
import { scheduleDateLabel, scheduleTimeLabel } from "@/lib/event-schedule";
import { useState } from "react";
import { Plus, Pencil, Eye, Trash2 } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { useResource } from "@/hooks/use-resource";
import { api } from "@/lib/client";
import { fa } from "@/lib/types";
import type { FastEventList, FastOrganizer } from "@/lib/fast-types";
import { fastCopy as t } from "@/locales/fast-fa";
import styles from "./fast.module.css";

export function FastEventList({ organizers, initial }: { organizers: FastOrganizer[]; initial?: FastEventList }) {
  const [filters, setFilters] = useState({ q: "", status: "all", host_id: "", page: 1 });
  const resource = useResource<FastEventList>(`/api/fast/events?${new URLSearchParams({ ...filters, page: String(filters.page) })}`, initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function remove(id: string, revision: number) {
    if (busy || !window.confirm(t.deleteConfirm)) return;
    setBusy(id); setError("");
    try { await api(`/api/fast/events/${encodeURIComponent(id)}`, { revision }, "DELETE"); resource.reload(); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(null); }
  }
  return <>
    <div className={styles.heading}><div><h1>{t.title}</h1><p>{t.draftHint}</p></div><AppLink className="button" href="/fast/events/new"><Plus size={18} />{t.newEvent}</AppLink></div>
    <EventSyncControls onComplete={resource.reload} />
    <form className={`${styles.card} ${styles.filters}`} onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      setFilters({ q: String(data.get("q") ?? ""), status: String(data.get("status")), host_id: String(data.get("host_id")), page: 1 });
    }}>
      <label className={styles.field}>{t.search}<input name="q" maxLength={120} type="search" /></label>
      <label className={styles.field}>{t.allStatuses}<select name="status"><option value="all">{t.allStatuses}</option><option value="draft">{t.draft}</option><option value="published">{t.published}</option></select></label>
      <label className={styles.field}>{t.organizer}<select name="host_id"><option value="">{t.allOrganizers}</option>{organizers.map(item => <option key={item.id} value={item.id}>{item.name || item.phone}</option>)}</select></label>
      <button className="button outline">{t.searchAction}</button>
    </form>
    {(error || resource.error) && <div className={styles.error} role="alert">{error || resource.error} {resource.errorStatus === 401 ? <AppLink href="/fast/login">{t.signIn}</AppLink> : <button className="button outline" onClick={resource.reload}>{t.retry}</button>}</div>}
    {resource.loading && <p role="status">{t.loading}</p>}
    {resource.data && <section className={styles.card} aria-label={t.title}>
      {!resource.data.items.length && <p className={styles.muted}>{t.empty}</p>}
      {resource.data.items.map(item => <article className={styles.row} key={item.id}>
        <div><h2>{item.title}</h2><span className={`${styles.badge} ${item.published ? styles.published : ""}`}>{item.published ? t.published : t.draft}</span><p>{item.organizer_name} · {item.city} · {scheduleDateLabel(item, true)} · {scheduleTimeLabel(item)}</p></div>
        <div className={styles.actions}>{!!item.published && <AppLink className="button outline" href={`/events/${encodeURIComponent(item.id)}`}><Eye size={16} />{t.view}</AppLink>}<AppLink className="button outline" href={`/fast/events/${encodeURIComponent(item.id)}`}><Pencil size={16} />{t.editEvent}</AppLink><button className={`button outline ${styles.danger}`} disabled={!!busy || !item.canDelete} title={!item.canDelete ? item.sheet_managed ? "رویداد متصل به شیت است؛ برای توقف انتشار، ردیف آن را از شیت حذف کنید." : t.deleteBlocked : undefined} onClick={() => void remove(item.id, item.revision)}><Trash2 size={16} />{t.delete}</button></div>
      </article>)}
      <div className={styles.pagination}><button className="button outline" disabled={filters.page <= 1} onClick={() => setFilters(value => ({ ...value, page: value.page - 1 }))}>{t.previous}</button><span>{fa(resource.data.page)} / {fa(resource.data.totalPages)}</span><button className="button outline" disabled={filters.page >= resource.data.totalPages} onClick={() => setFilters(value => ({ ...value, page: value.page + 1 }))}>{t.next}</button></div>
    </section>}
  </>;
}
