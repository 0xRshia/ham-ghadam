import { database } from "@/db";
import { boundary, json } from "@/lib/server";
import { attendeeFrom, attendeeName, attendeePhone, attendeeSearch, attendeeWhere, requireHostEvent } from "@/lib/host-attendees";

export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  boundary(async () => {
    const { id } = await params;
    const event = await requireHostEvent(req, id);
    const { query, namePattern, phonePattern, page } = attendeeSearch(req);
    const db = database();
    const [attendees, count, stats] = await db.batch([
      db.prepare(`SELECT r.id,r.event_id,r.quantity,r.total,r.status,r.created_at,r.payment_state,
        ${attendeeName} name,${attendeePhone} phone,
        (SELECT COUNT(*) FROM tickets t WHERE t.reservation_id=r.id AND t.checked_in_at IS NOT NULL) checkedIn
        ${attendeeFrom} ${attendeeWhere} ORDER BY r.created_at DESC,r.id LIMIT 50 OFFSET ?5`)
        .bind(id, query, namePattern, phonePattern, page * 50),
      db.prepare(`SELECT COUNT(*) total ${attendeeFrom} ${attendeeWhere}`).bind(id, query, namePattern, phonePattern),
      db.prepare(`SELECT COUNT(*) bookings,COALESCE(SUM(r.quantity),0) people,COALESCE(SUM(CASE WHEN r.payment_state<>'skipped_dev' THEN r.total ELSE 0 END),0) revenue,
        COALESCE(SUM((SELECT COUNT(*) FROM tickets t WHERE t.reservation_id=r.id AND t.checked_in_at IS NOT NULL)),0) checkedIn
        FROM reservations r WHERE r.event_id=? AND r.status='confirmed'`).bind(id),
    ]);
    return json({ event, attendees: attendees.results, attendeeTotal: (count.results[0] as { total: number }).total, page, stats: stats.results[0] });
  });
