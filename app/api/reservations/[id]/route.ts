import { faContent } from "@/locales/domain-fa";
import { eventThumbnail } from "@/lib/events";
import { database } from "@/db";
import {
  ApiError,
  boundary,
  body,
  json,
  requireUser,
  sameOrigin,
  rateLimit,
} from "@/lib/server";
import {
  verifyPayment,
  startPayment,
  type StoredBooking,
} from "@/lib/payments";
export const POST = (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) =>
  boundary(async () => {
    sameOrigin(req);
    const user = await requireUser(req);
    const id = (await params).id;
    const data = await body(req);
    const db = database();
    const b = await db
      .prepare("SELECT * FROM reservations WHERE id=? AND user_id=?")
      .bind(id, user.id)
      .first<StoredBooking>();
    if (!b) throw new ApiError(404, faContent.reservationNotFound);
    if (data.action === "retry") {
      await rateLimit("payment-retry:" + user.id, 20, 30000);
      if (b.status !== "hold" || (b.expires_at ?? 0) <= Date.now())
        throw new ApiError(
          409,
          faContent.reservationExpired,
        );
      if (b.authority)
        return json({
          paymentUrl: `https://payment.zarinpal.com/pg/StartPay/${encodeURIComponent(b.authority)}`,
        });
      const claim = await db
        .prepare(
          "UPDATE reservations SET payment_state='requesting' WHERE id=? AND authority IS NULL AND status='hold' AND (payment_state='request_unknown' OR (payment_state='requesting' AND created_at<?)) RETURNING id",
        )
        .bind(id, Date.now() - 30000)
        .first();
      if (!claim)
        throw new ApiError(
          409,
          faContent.paymentInProgress,
        );
      const event = await db
        .prepare("SELECT title FROM events WHERE id=?")
        .bind(b.event_id)
        .first<{ title: string }>();
      return json({
        paymentUrl: await startPayment(b, user.phone, event?.title ?? faContent.event),
      });
    }
    if (data.action === "verify") {
      await rateLimit("payment-check:" + user.id, 30);
      return json({ reservation: await verifyPayment(b) });
    }
    if (data.action !== "cancel")
      throw new ApiError(400, faContent.invalidRequest);
    const updated = await db
      .prepare(
        "UPDATE reservations SET status='cancelled' WHERE id=? AND user_id=? AND total=0 AND status='confirmed' AND NOT EXISTS(SELECT 1 FROM tickets WHERE reservation_id=reservations.id AND checked_in_at IS NOT NULL) AND EXISTS(SELECT 1 FROM events WHERE events.id=reservations.event_id AND starts_at>?) RETURNING id",
      )
      .bind(id, user.id, Date.now())
      .first();
    if (!updated)
      throw new ApiError(
        409,
        faContent.freeCancellationOnly,
      );
    return json({ ok: true });
  });

export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => boundary(async () => {
  const user = await requireUser(req); const id = (await params).id; const db = database();
  const reservation = await db.prepare(`SELECT r.id,r.event_id,r.quantity,r.total,r.status,r.created_at,r.expires_at,r.reference,r.payment_state,COALESCE(r.attendee_name,u.name) name,COALESCE(r.attendee_phone,u.phone) phone,e.title,e.venue,e.address,e.city,e.maps_url,e.lat,e.lng,${eventThumbnail} image,e.starts_at,e.ends_at FROM reservations r JOIN users u ON u.id=r.user_id JOIN events e ON e.id=r.event_id WHERE r.id=? AND r.user_id=?`).bind(id,user.id).first();
  if (!reservation) throw new ApiError(404,faContent.reservationNotFound);
  const { results } = await db.prepare("SELECT tier_name,quantity,unit_price FROM reservation_items WHERE reservation_id=? ORDER BY tier_name").bind(id).all();
  return json({ reservation, items: results, serverNow: Date.now() });
});
