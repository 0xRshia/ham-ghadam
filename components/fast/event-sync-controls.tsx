"use client";
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/client";
import { useResource } from "@/hooks/use-resource";
import { digits, fa } from "@/lib/types";
import type { SyncStatus } from "@/lib/event-sync";
import styles from "./fast.module.css";

const statuses: Record<string,string> = { queued: "در صف", importing: "در حال همگام‌سازی", completed: "تکمیل شد", partial: "تکمیل با خطای ردیف", failed: "ناموفق" };
function timestamp(value: number | null) { return value ? new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", dateStyle: "short", timeStyle: "short" }).format(value) : "هنوز ثبت نشده"; }

export function EventSyncControls({ onComplete }: { onComplete: () => void }) {
  const resource = useResource<SyncStatus>("/api/fast/event-sync");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const previousRun = useRef<string | null>(null);
  const data = resource.data;
  useEffect(() => {
    const timer = setInterval(resource.reload, data?.active ? 3000 : 30000);
    return () => clearInterval(timer);
  }, [resource.reload, data?.active]);
  useEffect(() => {
    if (data?.active) previousRun.current = data.active.id;
    else if (previousRun.current && data?.latest?.id === previousRun.current) { previousRun.current = null; onComplete(); }
  }, [data, onComplete]);
  async function submit(form?: HTMLFormElement) {
    setBusy(true); setError("");
    try {
      let result: SyncStatus;
      if (form && data) {
        const fields = new FormData(form);
        result = await api<SyncStatus>("/api/fast/event-sync", { sheet_url: String(fields.get("sheet_url")).trim(), persian_year: Number(digits(String(fields.get("persian_year")))), revision: data.settings.revision }, "PUT");
      } else result = await api<SyncStatus>("/api/fast/event-sync/run", {}, "POST");
      previousRun.current = result.active?.id ?? null;
      if (!result.active) onComplete();
      resource.reload();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  const run = data?.active ?? data?.latest;
  return <section className={styles.card} aria-labelledby="sheet-sync-title">
    <div className={styles.heading}><div><h2 id="sheet-sync-title">همگام‌سازی Google Sheets</h2><p>رویدادها هر ۱۲ ساعت به‌روز می‌شوند. حذف ردیف از شیت، انتشار رویداد را متوقف می‌کند.</p></div><button className="button outline" disabled={busy || !data?.configured || !!data.active} onClick={() => void submit()}><RefreshCw size={17} />همگام‌سازی اکنون</button></div>
    {data && <form key={data.settings.revision} className={styles.grid} onSubmit={event => { event.preventDefault(); void submit(event.currentTarget); }}>
      <label className={`${styles.field} ${styles.wide}`}>پیوند شیت<input required type="url" name="sheet_url" dir="ltr" maxLength={2048} defaultValue={data.settings.sheet_url} disabled={busy || !!data.active} /></label>
      <label className={styles.field}>سال شمسی برای تاریخ‌های بدون سال<input required name="persian_year" inputMode="numeric" pattern="[0-9۰-۹٠-٩]{4}" defaultValue={data.settings.persian_year} disabled={busy || !!data.active} /></label>
      <div className={styles.actions}><button className="button" disabled={busy || !!data.active}>{busy ? "در حال بررسی…" : "ذخیره و همگام‌سازی"}</button></div>
      <p className={`${styles.muted} ${styles.wide}`}>تغییر پیوند، منبع رویدادهای واردشده را جایگزین می‌کند. شیت و فایل‌های پوستر باید دسترسی عمومی داشته باشند. زمان‌ها به وقت تهران هستند.</p>
    </form>}
    {(error || resource.error) && <p className={styles.error} role="alert">{error || resource.error}<button className="button outline" onClick={resource.reload}>تلاش دوباره</button></p>}
    {resource.loading && <p role="status">در حال دریافت وضعیت…</p>}
    {data && <>
      {!data.configured ? <p className={styles.notice}>زمان‌بند آماده نیست؛ مدیر سرور باید EVENT_SYNC_JOB_SECRET و سرویس زمان‌بندی Docker را تنظیم کند.</p> : (!data.settings.heartbeat_at || data.serverNow - data.settings.heartbeat_at > 120000) && <p className={styles.notice}>ارتباط تازه‌ای از زمان‌بند دریافت نشده است؛ سرویس زمان‌بندی Docker را بررسی کنید.</p>}
      <p className={styles.muted}>اجرای بعد: {timestamp(data.settings.next_scheduled_at)} · آخرین ارتباط زمان‌بند: {timestamp(data.settings.heartbeat_at)}</p>
      {run && <div aria-live="polite"><p><strong>{statuses[run.status] ?? run.status}</strong> · {timestamp(run.finished_at ?? run.created_at)}</p><p>{fa(run.created)} ایجاد · {fa(run.updated)} به‌روز · {fa(run.unchanged)} بدون تغییر · {fa(run.unpublished)} توقف انتشار · {fa(run.failed)} خطا · {fa(run.pending)} باقی‌مانده از {fa(run.total)}</p>
        {run.error && <p className={styles.error}>{run.error}</p>}
        {!!run.errors.length && <details><summary>خطاهای ردیف‌ها ({fa(run.failed)})</summary><ul>{run.errors.map(item => <li key={item.row_number}>ردیف {fa(item.row_number)}: {item.error}</li>)}</ul>{run.failed > 100 && <p>۱۰۰ خطای نخست نمایش داده می‌شود.</p>}</details>}
      </div>}
    </>}
  </section>;
}
