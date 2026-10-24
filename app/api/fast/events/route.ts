import { database } from "@/db";
import { ApiError, boundary, json, sameOrigin } from "@/lib/server";
import { requireFast } from "@/lib/fast-auth";
import { saveFastEvent } from "@/lib/fast-events";
import { eventSelect } from "@/lib/events";
import { readPage, pageResult } from "@/lib/pagination";
import { readEventSubmission, discardEventRequest } from "@/lib/event-media";
import { faContent } from "@/locales/domain-fa";

export const GET = (req: Request) => boundary(async () => {
  await requireFast(req);
  const url = new URL(req.url);
  const { page, pageSize, offset } = readPage(url, 20);
  const status = url.searchParams.get("status") ?? "all";
  if (!["all", "draft", "published"].includes(status)) throw new ApiError(400, faContent.invalidInformation);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120).replace(/[\\%_]/g, "\\$&");
  const hostId = url.searchParams.get("host_id") ?? "";
  const where = ` WHERE (?2='' OR e.title LIKE ?3 ESCAPE '\\' OR e.city LIKE ?3 ESCAPE '\\') AND (?4='' OR COALESCE(e.organizer_id,e.host_id)=?4) AND (?5='all' OR e.published=CASE WHEN ?5='published' THEN 1 ELSE 0 END)`;
  const values = [Date.now(), q, `%${q}%`, hostId, status];
  const db = database();
  const [rows, count] = await db.batch([
    db.prepare(eventSelect.replace("SELECT e.*,", "SELECT e.*,(SELECT name FROM users WHERE id=e.host_id) linked_organizer_name,EXISTS(SELECT 1 FROM reservations WHERE event_id=e.id) hasReservations,NOT EXISTS(SELECT 1 FROM reservations WHERE event_id=e.id) AND NOT EXISTS(SELECT 1 FROM event_reviews WHERE event_id=e.id) canDelete,") + where + " ORDER BY e.starts_at DESC,e.id LIMIT ?6 OFFSET ?7").bind(...values,pageSize,offset),
    db.prepare("SELECT COUNT(*) total FROM events e" + where.replaceAll("?2", "?1").replaceAll("?3", "?2").replaceAll("?4", "?3").replaceAll("?5", "?4")).bind(...values.slice(1)),
  ]);
  const items = (rows.results as { hasReservations: number; canDelete: number; organizer_name: string | null; linked_organizer_name: string | null }[]).map(({ linked_organizer_name, ...item }) => ({ ...item, organizer_name: item.organizer_name ?? linked_organizer_name, hasReservations: !!item.hasReservations, canDelete: !!item.canDelete }));
  return json(pageResult(items, Number((count.results[0] as {total:number}).total), page, pageSize));
});

export const POST = (req: Request) => boundary(async () => {
  try { sameOrigin(req); await requireFast(req, true); }
  catch (error) { await discardEventRequest(req); throw error; }
  const { data, uploads } = await readEventSubmission(req);
  return json({ event: await saveFastEvent(data, uploads) }, 201);
});
