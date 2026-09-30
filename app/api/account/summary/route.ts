import { database } from "@/db";
import { eventThumbnail } from "@/lib/events";
import { boundary, json, requireUser } from "@/lib/server";
import type { Reservation } from "@/lib/types";
import { confirmedReservationSql, outstandingReservationSql } from "@/lib/account-types";

const reservationSummarySelect = `SELECT r.id,r.event_id,r.quantity,r.total,r.status,r.created_at,r.expires_at,r.reference,r.payment_state,COALESCE(r.attendee_name,u.name) name,COALESCE(r.attendee_phone,u.phone) phone,e.title,e.venue,e.address,e.city,e.maps_url,e.lat,e.lng,${eventThumbnail} image,e.starts_at,e.ends_at FROM reservations r JOIN events e ON e.id=r.event_id JOIN users u ON u.id=r.user_id`;

export const GET = (req: Request) =>
  boundary(async () => {
    const user = await requireUser(req);
    const db = database();
    const now = Date.now();
    const [latestPurchase, latestOutstanding, totals] = await Promise.all([
      db.prepare(`${reservationSummarySelect} WHERE r.user_id=? AND ${confirmedReservationSql("r.")} ORDER BY r.created_at DESC,r.id DESC LIMIT 1`)
        .bind(user.id).first<Reservation>(),
      db.prepare(`${reservationSummarySelect} WHERE r.user_id=? AND ${outstandingReservationSql("r.")} ORDER BY r.created_at DESC,r.id DESC LIMIT 1`)
        .bind(user.id, now).first<Reservation>(),
      db.prepare(`SELECT COUNT(*) reservation_count,
          SUM(CASE WHEN ${confirmedReservationSql()} THEN 1 ELSE 0 END) confirmed_count,
          SUM(CASE WHEN ${outstandingReservationSql()} THEN 1 ELSE 0 END) outstanding_count
        FROM reservations WHERE user_id=?`).bind(now, user.id)
        .first<{ reservation_count: number; confirmed_count: number; outstanding_count: number }>(),
    ]);
    return json({
      user,
      latestPurchase: latestPurchase ?? null,
      latestOutstanding: latestOutstanding ?? null,
      reservationCount: Number(totals?.reservation_count ?? 0),
      confirmedCount: Number(totals?.confirmed_count ?? 0),
      outstandingCount: Number(totals?.outstanding_count ?? 0),
      serverNow: now,
    });
  });
