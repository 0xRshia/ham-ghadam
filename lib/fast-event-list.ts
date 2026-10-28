import type { EventItem } from "./types";
import { decodeEvent } from "./event-schedule";
import { database } from "@/db";
import { ApiError } from "./server";
import { eventSelect } from "./events";
import { readPage, pageResult } from "./pagination";
import { faContent } from "@/locales/domain-fa";

export async function fastEventList(url: URL) {
  const { page, pageSize, offset } = readPage(url, 20);
  const status = url.searchParams.get("status") ?? "all";
  if (!["all", "draft", "published"].includes(status)) throw new ApiError(400, faContent.invalidInformation);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120).replace(/[\\%_]/g, "\\$&");
  const hostId = url.searchParams.get("host_id") ?? "";
  const where = ` WHERE (?2='' OR e.title LIKE ?3 ESCAPE '\\' OR e.city LIKE ?3 ESCAPE '\\') AND (?4='' OR COALESCE(e.organizer_id,e.host_id)=?4) AND (?5='all' OR e.published=CASE WHEN ?5='published' THEN 1 ELSE 0 END)`;
  const values = [Date.now(), q, `%${q}%`, hostId, status];
  const db = database();
  const [rows, count] = await db.batch([
    db.prepare(eventSelect.replace("SELECT e.*,", "SELECT e.*,(SELECT name FROM users WHERE id=e.host_id) linked_organizer_name,EXISTS(SELECT 1 FROM reservations WHERE event_id=e.id) hasReservations,NOT EXISTS(SELECT 1 FROM event_sheet_links WHERE event_id=e.id) AND NOT EXISTS(SELECT 1 FROM reservations WHERE event_id=e.id) AND NOT EXISTS(SELECT 1 FROM event_reviews WHERE event_id=e.id) canDelete,") + where + " ORDER BY e.starts_at DESC,e.id LIMIT ?6 OFFSET ?7").bind(...values,pageSize,offset),
    db.prepare("SELECT COUNT(*) total FROM events e" + where.replaceAll("?2", "?1").replaceAll("?3", "?2").replaceAll("?4", "?3").replaceAll("?5", "?4")).bind(...values.slice(1)),
  ]);
  const items = (rows.results as (EventItem & { revision: number; hasReservations: number; canDelete: number; organizer_name: string | null; linked_organizer_name: string | null })[]).map(row => { const { linked_organizer_name, ...item } = decodeEvent(row); return ({ ...item, organizer_name: item.organizer_name ?? linked_organizer_name, hasReservations: !!item.hasReservations, canDelete: !!item.canDelete }); });
  return pageResult(items, Number((count.results[0] as {total:number}).total), page, pageSize);
}
