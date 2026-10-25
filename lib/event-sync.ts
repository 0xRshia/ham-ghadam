import { config, database } from "@/db";
import { ApiError, hash } from "./server";
import { fetchSheet, fetchSheetPoster, sheetEventInput, sheetSource, type SheetRow } from "./event-sheet-source";
import { fastEvent, saveFastEvent } from "./fast-events";

export type SyncSettings = { sheet_url: string; persian_year: number; revision: number; next_scheduled_at: number; heartbeat_at: number | null };
export type SyncRun = {
  id: string; settings_revision: number; sheet_url: string; persian_year: number; trigger: string;
  status: string; lease_token: string; lease_until: number; total: number; created_at: number;
  finished_at: number | null; unpublished: number; error: string | null;
  active: number | null;
};
type SyncItem = { row_number: number; external_id: string; payload_json: string };
type SheetLink = { event_id: string; image_hash: string; source_hash: string };
export type SyncStatus = {
  configured: boolean; settings: SyncSettings; active: SyncRunView | null; latest: SyncRunView | null; serverNow: number;
};
export type SyncRunView = Omit<SyncRun, "lease_token" | "lease_until" | "settings_revision" | "active"> & {
  created: number; updated: number; unchanged: number; failed: number; pending: number;
  errors: { row_number: number; external_id: string; error: string }[];
};

const interval = 12 * 3600000;
export function nextSyncAt(now: number) { return (Math.floor(now / interval) + 1) * interval; }
export function syncConfigured() { return (config().EVENT_SYNC_JOB_SECRET?.length ?? 0) >= 32; }
export async function syncSettings() {
  const settings = await database().prepare("SELECT sheet_url,persian_year,revision,next_scheduled_at,heartbeat_at FROM event_sync_settings WHERE id=1").first<SyncSettings>();
  if (!settings) throw new ApiError(503, "مهاجرت همگام‌سازی شیت اعمال نشده است.");
  return settings;
}
async function activeRun() { return database().prepare("SELECT * FROM event_sync_runs WHERE active=1").first<SyncRun>(); }

async function runView(run: SyncRun): Promise<SyncRunView> {
  const db = database();
  const counts = await db.prepare(`SELECT SUM(status='created') created,SUM(status='updated') updated,SUM(status='unchanged') unchanged,
    SUM(status='failed') failed,SUM(status='pending') pending FROM event_sync_items WHERE run_id=?`).bind(run.id).first<Record<string, number | null>>();
  const errors = await db.prepare("SELECT row_number,external_id,error FROM event_sync_items WHERE run_id=? AND status='failed' ORDER BY row_number LIMIT 100").bind(run.id).all<{ row_number: number; external_id: string; error: string }>();
  const { lease_token: _token, lease_until: _until, settings_revision: _revision, active: _active, ...publicRun } = run;
  void _token; void _until; void _revision; void _active;
  return { ...publicRun, created: counts?.created ?? 0, updated: counts?.updated ?? 0, unchanged: counts?.unchanged ?? 0, failed: counts?.failed ?? 0, pending: counts?.pending ?? 0, errors: errors.results };
}
export async function eventSyncStatus(): Promise<SyncStatus> {
  const [settings, active, latest] = await Promise.all([syncSettings(), activeRun(), database().prepare("SELECT * FROM event_sync_runs ORDER BY created_at DESC,id DESC LIMIT 1").first<SyncRun>()]);
  return { configured: syncConfigured(), settings, active: active ? await runView(active) : null, latest: latest ? await runView(latest) : null, serverNow: Date.now() };
}
function enqueueStatement(trigger: string, now: number) {
  return database().prepare(`INSERT INTO event_sync_runs(id,settings_revision,sheet_url,persian_year,trigger,status,active,created_at)
    SELECT ?,revision,sheet_url,persian_year,?,'queued',1,? FROM event_sync_settings WHERE id=1
    AND NOT EXISTS(SELECT 1 FROM event_sync_runs WHERE active=1) ON CONFLICT(active) DO NOTHING`).bind(crypto.randomUUID(), trigger, now);
}
export async function queueEventSync() {
  if (!syncConfigured()) throw new ApiError(503, "راز مستقل EVENT_SYNC_JOB_SECRET برای کار زمان‌بندی تنظیم نشده است.");
  await enqueueStatement("manual", Date.now()).run();
  return eventSyncStatus();
}
export async function saveSyncSettings(data: Record<string, unknown>) {
  const source = sheetSource(data.sheet_url);
  const year = Number(data.persian_year);
  if (!Number.isInteger(year) || year < 1400 || year > 1499 || !Number.isSafeInteger(data.revision)) throw new ApiError(400, "سال شمسی و نسخهٔ تنظیمات معتبر وارد کنید.");
  if (await activeRun()) throw new ApiError(409, "تا پایان همگام‌سازی جاری، تغییر تنظیمات ممکن نیست.");
  // Verify access and the complete identity set before replacing the configured feed.
  await fetchSheet(source.url);
  const db = database();
  try {
    await db.batch([
      db.prepare(`UPDATE event_sync_settings SET sheet_url=?1,persian_year=?2,
        revision=CASE WHEN revision=?3 AND NOT EXISTS(SELECT 1 FROM event_sync_runs WHERE active=1) THEN revision+1 ELSE NULL END
        WHERE id=1`).bind(source.url, year, data.revision as number),
      enqueueStatement("configuration", Date.now()),
    ]);
  } catch (error) {
    if (String(error).includes("NOT NULL constraint failed: event_sync_settings.revision")) throw new ApiError(409, "تنظیمات هم‌زمان تغییر کرده‌اند؛ صفحه را تازه کنید.");
    throw error;
  }
  return eventSyncStatus();
}

function leaseGuard(run: SyncRun) {
  // Evaluate expiry when the transaction executes, including time spent uploading media.
  return database().prepare(`UPDATE event_sync_runs SET lease_token=CASE WHEN lease_token=?1
    AND lease_until>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) AND active=1
    AND settings_revision=(SELECT revision FROM event_sync_settings WHERE id=1) THEN lease_token ELSE NULL END WHERE id=?2 RETURNING id`)
    .bind(run.lease_token, run.id);
}
function publicError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) return "مهلت دریافت فایل پایان یافت؛ در اجرای بعد دوباره تلاش می‌شود.";
  console.error("Event sheet sync failed", error instanceof Error ? error.name : "Unknown");
  return "ذخیره یا دریافت اطلاعات ناموفق بود؛ دسترسی منبع و گزارش سرور را بررسی کنید.";
}
async function snapshot(run: SyncRun) {
  const rows = await fetchSheet(run.sheet_url);
  const db = database();
  await db.batch([
    leaseGuard(run),
    ...rows.map((row, index) => db.prepare("INSERT INTO event_sync_items(run_id,row_number,external_id,payload_json) VALUES(?,?,?,?)").bind(run.id,row._row ?? index + 2,row.ID,JSON.stringify(row))),
    db.prepare("UPDATE event_sync_runs SET status='importing',total=? WHERE id=?").bind(rows.length,run.id),
  ]);
}
async function importItem(run: SyncRun, item: SyncItem) {
  const db = database();
  const row = JSON.parse(item.payload_json) as SheetRow;
  const parsed = sheetEventInput(row, run.persian_year);
  const poster = await fetchSheetPoster(row["پوستر"]);
  const link = await db.prepare("SELECT event_id,image_hash,source_hash FROM event_sheet_links WHERE external_id=?").bind(item.external_id).first<SheetLink>();
  const previous = link ? await fastEvent(link.event_id) : undefined;
  const sourceHash = await hash(JSON.stringify([row,run.persian_year,poster.hash]));
  if (link?.source_hash === sourceHash && previous?.published && previous.image) {
    await db.batch([
      leaseGuard(run),
      db.prepare("UPDATE event_sheet_links SET last_run_id=? WHERE external_id=?").bind(run.id,item.external_id),
      db.prepare("UPDATE event_sync_items SET status='unchanged' WHERE run_id=? AND row_number=?").bind(run.id,item.row_number),
    ]);
    return;
  }
  // Category and app-only enrichment belong to the admin, not the source sheet.
  const input = { ...parsed.input, category: previous?.category ?? parsed.input.category, price: previous?.price ?? 0, originalPrice: previous?.original_price ?? null, capacity: previous?.capacity ?? null };
  const replacePoster = !previous?.image || link?.image_hash !== poster.hash;
  await saveFastEvent({ revision: previous?.revision, host_id: null, organizer_name: parsed.organizer, instagram_url: parsed.instagram,
    published: true, coverAction: replacePoster ? "replace" : "keep" }, replacePoster ? [poster] : [], previous?.id, {
    input, schedule: parsed.schedule, before: [leaseGuard(run)], after: eventId => [
      db.prepare(`INSERT INTO event_sheet_links(external_id,event_id,image_hash,source_hash,last_run_id) VALUES(?,?,?,?,?)
        ON CONFLICT(external_id) DO UPDATE SET image_hash=excluded.image_hash,source_hash=excluded.source_hash,last_run_id=excluded.last_run_id,
        event_id=CASE WHEN event_id=excluded.event_id THEN event_id ELSE NULL END`).bind(item.external_id,eventId,poster.hash,sourceHash,run.id),
      db.prepare("UPDATE event_sync_items SET status=? WHERE run_id=? AND row_number=?").bind(previous ? "updated" : "created",run.id,item.row_number),
    ],
  });
}
async function reconcile(run: SyncRun) {
  const db = database();
  // Membership includes failed rows: a bad poster never makes an existing event disappear.
  const missing = `e.published=1 AND EXISTS(SELECT 1 FROM event_sheet_links l WHERE l.event_id=e.id
    AND NOT EXISTS(SELECT 1 FROM event_sync_items i WHERE i.run_id=?1 AND i.external_id=l.external_id))`;
  await db.batch([
    leaseGuard(run),
    db.prepare(`UPDATE event_sync_runs SET unpublished=(SELECT COUNT(*) FROM events e WHERE ${missing}) WHERE id=?1`).bind(run.id),
    db.prepare(`UPDATE events AS e SET published=0,revision=revision+1 WHERE ${missing}`).bind(run.id),
    db.prepare(`UPDATE event_sync_runs SET status=CASE WHEN EXISTS(SELECT 1 FROM event_sync_items WHERE run_id=?1 AND status='failed') THEN 'partial' ELSE 'completed' END,
      active=NULL,finished_at=?2,lease_until=0 WHERE id=?1`).bind(run.id,Date.now()),
  ]);
}

/** One HTTP tick does bounded work; the Docker worker immediately requests the next batch. */
export async function processEventSync() {
  const db = database();
  const now = Date.now();
  await db.prepare("UPDATE event_sync_settings SET heartbeat_at=? WHERE id=1").bind(now).run();
  // Retain a month of row diagnostics; source-to-event links outlive run history.
  await db.prepare("DELETE FROM event_sync_runs WHERE active IS NULL AND finished_at<? AND id NOT IN (SELECT id FROM event_sync_runs ORDER BY created_at DESC LIMIT 20)").bind(now-30*86400000).run();
  const settings = await syncSettings();
  if (settings.next_scheduled_at <= now) await db.batch([
    enqueueStatement("scheduled", now),
    db.prepare("UPDATE event_sync_settings SET next_scheduled_at=? WHERE id=1 AND next_scheduled_at<=?").bind(nextSyncAt(now),now),
  ]);
  const run = await db.prepare("UPDATE event_sync_runs SET lease_token=?,lease_until=? WHERE active=1 AND lease_until<=? RETURNING *")
    .bind(crypto.randomUUID(),now+90000,now).first<SyncRun>();
  if (!run) return { hasMore: !!await activeRun() };
  try {
    if (run.status === "queued") await snapshot(run);
    const items = await db.prepare("SELECT row_number,external_id,payload_json FROM event_sync_items WHERE run_id=? AND status='pending' ORDER BY row_number LIMIT 2").bind(run.id).all<SyncItem>();
    for (const item of items.results) {
      try { await importItem(run,item); }
      catch (error) {
        // Recording a row failure also requires the current lease, preventing stale workers from continuing.
        await db.batch([leaseGuard(run), db.prepare("UPDATE event_sync_items SET status='failed',error=? WHERE run_id=? AND row_number=? AND status='pending'").bind(publicError(error),run.id,item.row_number)]);
      }
    }
    const pending = await db.prepare("SELECT 1 FROM event_sync_items WHERE run_id=? AND status='pending' LIMIT 1").bind(run.id).first();
    if (!pending) await reconcile(run);
    else await db.prepare("UPDATE event_sync_runs SET lease_until=0 WHERE id=? AND lease_token=?").bind(run.id,run.lease_token).run();
    return { hasMore: !!pending };
  } catch (error) {
    // An expired worker must never mark a successor's run failed or clear its lease.
    await db.prepare("UPDATE event_sync_runs SET status='failed',active=NULL,finished_at=?,error=?,lease_until=0 WHERE id=? AND lease_token=? AND lease_until>?")
      .bind(Date.now(),publicError(error),run.id,run.lease_token,Date.now()).run();
    return { hasMore: !!await activeRun() };
  }
}
