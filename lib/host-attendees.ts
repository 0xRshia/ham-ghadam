import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { eventSelect } from "@/lib/events";
import { ApiError, requireUser } from "@/lib/server";
import { digits, type EventItem } from "@/lib/types";

export async function requireHostEvent(req: Request, id: string) {
  const host = await requireUser(req, true);
  const event = await database().prepare(eventSelect + " WHERE e.id=?2 AND e.host_id=?3")
    .bind(Date.now(), id, host.id).first<EventItem>();
  if (!event) throw new ApiError(404, faContent.eventNotFound);
  return event;
}

export const attendeeName = "COALESCE(r.attendee_name,u.name)";
export const attendeePhone = "COALESCE(r.attendee_phone,u.phone)";
export const attendeeFrom = "FROM reservations r JOIN users u ON u.id=r.user_id";
export const attendeeWhere = `WHERE r.event_id=?1 AND r.status='confirmed'
  AND (?2='' OR replace(replace(${attendeeName},'ي','ی'),'ك','ک') LIKE ?3 ESCAPE '\\'
  OR ${attendeePhone} LIKE ?4 ESCAPE '\\')`;

export function attendeeSearch(req: Request) {
  const url = new URL(req.url);
  const query = digits((url.searchParams.get("q") || "").trim().slice(0, 100)).replace(/ي/g, "ی").replace(/ك/g, "ک");
  const escape = (s: string) => s.replace(/[\\%_]/g, "\\$&");
  const phone = query.replace(/[\s()-]/g, "").replace(/^(\+98|0098)/, "0");
  const page = Math.max(0, Math.min(100000, Math.floor(Number(url.searchParams.get("page")) || 0)));
  return { query, namePattern: `%${escape(query)}%`, phonePattern: `%${escape(phone || query)}%`, page };
}

export function csvCell(value: string) {
  // Spreadsheet formulas are executable even inside quoted CSV cells.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? "'" + value : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
