import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { ApiError, boundary, body, json, rateLimit, sameOrigin } from "@/lib/server";
import { TICKET_PREFIX } from "@/lib/tickets";

type ScannerEvent = { id: string; title: string; venue: string; address: string; city: string; starts_at: number; ends_at: number };

async function scannerEvent(req: Request) {
  const token = req.headers.get("X-Scanner-Key") || "";
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new ApiError(403, faContent.scannerLinkInvalid);
  const event = await database().prepare(`SELECT e.id,e.title,e.venue,e.address,e.city,e.starts_at,e.ends_at
    FROM event_scanners s JOIN events e ON e.id=s.event_id WHERE s.token=?`).bind(token).first<ScannerEvent>();
  if (!event) throw new ApiError(403, faContent.scannerLinkRevoked);
  return { event, token };
}

export const GET = (req: Request) => boundary(async () => {
  const { event } = await scannerEvent(req);
  return json({ event });
});

export const POST = (req: Request) => boundary(async () => {
  sameOrigin(req);
  const { event, token } = await scannerEvent(req);
  await rateLimit("scan:" + event.id, 12000);
  const data = await body(req);
  if (typeof data.qr !== "string" || !/^hg-ticket:v1:[a-f0-9]{64}$/.test(data.qr))
    throw new ApiError(400, faContent.invalidHamghadamTicket);
  if (event.ends_at <= Date.now()) throw new ApiError(409, faContent.eventEnded);
  const db = database();
  // Scope, payment status, revocation and single use are checked in the same write.
  const admitted = await db.prepare(`UPDATE tickets SET checked_in_at=?1 WHERE token=?2 AND checked_in_at IS NULL
    AND EXISTS(SELECT 1 FROM reservations r JOIN events e ON e.id=r.event_id
      JOIN event_scanners s ON s.event_id=e.id WHERE r.id=tickets.reservation_id
      AND r.status='confirmed' AND e.id=?3 AND e.ends_at>?1 AND s.token=?4) RETURNING id`)
    .bind(Date.now(), data.qr.slice(TICKET_PREFIX.length), event.id, token).first<{ id: string }>();
  const ticket = await db.prepare(`SELECT t.id,t.ordinal,t.checked_in_at,COALESCE(r.attendee_name,u.name) name,
    e.title,e.venue,e.address,e.city,e.starts_at,e.ends_at FROM tickets t
    JOIN reservations r ON r.id=t.reservation_id JOIN users u ON u.id=r.user_id JOIN events e ON e.id=r.event_id
    JOIN event_scanners s ON s.event_id=e.id WHERE t.token=? AND e.id=? AND r.status='confirmed' AND s.token=?`)
    .bind(data.qr.slice(TICKET_PREFIX.length), event.id, token).first<{ checked_in_at: number | null }>();
  if (!ticket) throw new ApiError(404, faContent.ticketNotValidForEvent);
  if (!admitted && !ticket.checked_in_at) throw new ApiError(409, faContent.checkInFailed);
  return json({ status: admitted ? "checked_in" : "already_checked_in", ticket });
});
