import { faContent } from "@/locales/domain-fa";
import { eventPurchasable, NOT_PURCHASABLE_MESSAGE } from "@/lib/product-mode";
import { getTicketTiers, readTicketSelection, reserveTiersSql, reserveTiersWithSquirrelCouponSql, insertReservationItemsSql } from "@/lib/ticket-tiers";
import { database, config } from "@/db";
import { MIN_PAID_TOMAN, MAX_ORDER_TOMAN } from "@/lib/payment-limits";
import { getEvent, eventThumbnail } from "@/lib/events";
import { reserveSql, reserveWithSquirrelCouponSql, squirrelCouponAvailableSql } from "@/lib/booking-sql";
import { isSquirrelCoupon, normalizeSquirrelCoupon, squirrelTicketDiscount } from "@/lib/squirrel-coupon";
import { registrationState } from "@/lib/registration";
import { reconcileSquirrelCouponHold, startPayment, type StoredBooking } from "@/lib/payments";
import { ensureTickets } from "@/lib/tickets";
import { pageResult, readPage } from "@/lib/pagination";
import {
  ApiError,
  boundary,
  body,
  json,
  paymentReady,
  skipPayDevEnabled,
  requireUser,
  sameOrigin,
  rateLimit,
} from "@/lib/server";

function readCouponCode(value: unknown) {
  if (value === undefined) return null;
  const code = typeof value === "string" ? normalizeSquirrelCoupon(value) : "";
  if (!isSquirrelCoupon(code)) throw new ApiError(400, "کد تخفیف را بررسی کنید.", { code: "squirrel_coupon_invalid" });
  return code;
}

const couponUnavailable = () => new ApiError(409, "این کد تخفیف معتبر نیست یا قبلاً برای سفارشی استفاده شده است.", { code: "squirrel_coupon_unavailable" });

export const GET = (req: Request) =>
  boundary(async () => {
    const user = await requireUser(req);
    const url = new URL(req.url);
    const paginated = url.searchParams.has("page") || url.searchParams.has("pageSize");
    const { page, pageSize, offset } = readPage(url, 10);
    const db = database();
    if (paginated) {
      const [{ results }, count] = await Promise.all([
        db.prepare(
          `SELECT r.id,r.event_id,r.quantity,r.total,r.status,r.created_at,r.expires_at,r.reference,r.payment_state,COALESCE(r.attendee_name,u.name) name,COALESCE(r.attendee_phone,u.phone) phone,e.title,e.category,e.venue,e.address,e.city,e.maps_url,e.lat,e.lng,${eventThumbnail} image,e.starts_at,e.ends_at FROM reservations r JOIN events e ON e.id=r.event_id JOIN users u ON u.id=r.user_id WHERE r.user_id=? ORDER BY r.created_at DESC,r.id DESC LIMIT ? OFFSET ?`,
        ).bind(user.id, pageSize, offset).all(),
        db.prepare("SELECT COUNT(*) total FROM reservations WHERE user_id=?")
          .bind(user.id).first<{ total: number }>(),
      ]);
      return json({ ...pageResult(results, Number(count?.total ?? 0), page, pageSize), serverNow: Date.now() });
    }
    const { results } = await database()
      .prepare(
        `SELECT r.id,r.event_id,r.quantity,r.total,r.status,r.created_at,r.expires_at,r.reference,r.payment_state,COALESCE(r.attendee_name,u.name) name,COALESCE(r.attendee_phone,u.phone) phone,e.title,e.category,e.venue,e.address,e.city,e.maps_url,e.lat,e.lng,${eventThumbnail} image,e.starts_at,e.ends_at FROM reservations r JOIN events e ON e.id=r.event_id JOIN users u ON u.id=r.user_id WHERE r.user_id=? ORDER BY r.created_at DESC`,
      )
      .bind(user.id)
      .all();
    const { results: items } = await db.prepare(`SELECT ri.reservation_id,ri.tier_name name,ri.quantity
      FROM reservation_items ri JOIN reservations r ON r.id=ri.reservation_id WHERE r.user_id=? ORDER BY ri.tier_id`).bind(user.id).all<{reservation_id:string;name:string;quantity:number}>();
    const byReservation = new Map<string,{name:string;quantity:number}[]>();
    for (const item of items) { const list=byReservation.get(item.reservation_id) ?? [];list.push({name:item.name,quantity:item.quantity});byReservation.set(item.reservation_id,list); }
    return json({ reservations: results.map(record=>({...record,ticket_items:byReservation.get(record.id as string) ?? []})), serverNow: Date.now() });
  });
export const POST = (req: Request) =>
  boundary(async () => {
    sameOrigin(req);
    const user = await requireUser(req);
    const data = await body(req);
    if (
      typeof data.eventId !== "string" ||
      typeof data.requestKey !== "string" ||
      !/^[\w-]{16,80}$/.test(data.requestKey) ||
      !Number.isInteger(data.quantity) ||
      data.quantity < 1 ||
      data.quantity > 6
    )
      throw new ApiError(400, faContent.invalidReservation);
    await rateLimit("book:" + user.id, 60);
    const db = database();
    const selection = readTicketSelection(data.items);
    const couponCode = readCouponCode(data.couponCode);
    const couponAvailable = async (code: string) => {
      const result = await db.prepare(`SELECT ${squirrelCouponAvailableSql("?1")} AS available`).bind(code).first<{ available: number }>();
      return result?.available === 1;
    };
    const selectionMatches = async (reservationId: string) => {
      const { results } = await db.prepare("SELECT tier_id tierId,quantity FROM reservation_items WHERE reservation_id=?").bind(reservationId).all<{tierId:string;quantity:number}>();
      return results.length === (selection?.length ?? 0) && results.every(item=>selection?.some(candidate=>candidate.tierId===item.tierId && candidate.quantity===item.quantity));
    };
    const findExisting = () => db.prepare("SELECT * FROM reservations WHERE user_id=? AND request_key=?")
      .bind(user.id, data.requestKey).first<StoredBooking>();
    const respondExisting = async (existing: StoredBooking) => {
      if (
        existing.event_id !== data.eventId ||
        existing.quantity !== data.quantity ||
        (existing.squirrel_coupon_code ?? null) !== couponCode ||
        !(await selectionMatches(existing.id))
      )
        throw new ApiError(
          409,
          faContent.requestKeyReused,
        );
      if (existing.status === "confirmed") await ensureTickets(existing.id);
      return json({
        reservation: existing,
        paymentUrl:
          existing.authority &&
          existing.status === "hold" &&
          (existing.expires_at ?? 0) > Date.now()
            ? `https://payment.zarinpal.com/pg/StartPay/${encodeURIComponent(existing.authority)}`
            : null,
      });
    };
    const existing = await findExisting();
    if (existing) return respondExisting(existing);
    const email = typeof data.email === "string" ? data.email.trim() : "";
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new ApiError(400, faContent.invalidEmailAddress);
    const name = typeof data.name === "string" ? data.name.trim() : user.name.trim();
    if (name.length < 2 || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name))
      throw new ApiError(400, faContent.buyerNameLength);
    const event = await getEvent(data.eventId);
    if (
      !event ||
      (event.sample === 1 && config().SEED_SAMPLE_EVENTS !== "true")
    )
      throw new ApiError(404, faContent.eventNotFound);
    // Events without an explicit price are informational only; never issue
    // "free" tickets for them, including through tiers or a direct API call.
    if (!eventPurchasable(event)) throw new ApiError(403, NOT_PURCHASABLE_MESSAGE);
    const tiers = await getTicketTiers(event.id);
    if (tiers.length && !selection) throw new ApiError(400, faContent.selectTier);
    let subtotal = event.price * data.quantity;
    if (selection) {
      subtotal = 0;
      if (selection.reduce((sum, item) => sum + item.quantity, 0) !== data.quantity) throw new ApiError(400, faContent.invalidTicketQuantity);
      for (const item of selection) {
        const tier = tiers.find(tier => tier.id === item.tierId);
        if (!tier) throw new ApiError(400, faContent.tierUnavailable);
        subtotal += tier.price * item.quantity;
      }
    }
    const availability = registrationState(event, Date.now());
    if (availability === "expired" || availability === "ended")
      throw new ApiError(409, faContent.registrationClosed);
    if (
      subtotal > 0 &&
      (subtotal < MIN_PAID_TOMAN ||
        subtotal > MAX_ORDER_TOMAN)
    )
      throw new ApiError(
        400,
        faContent.totalAmountRange,
      );
    if (couponCode) {
      if (event.sample === 1 || subtotal === 0) {
        throw new ApiError(400, "کد تخفیف برای بلیت‌های قیمت‌دار رویدادهای واقعی است.", { code: "squirrel_coupon_ineligible" });
      }
      if (!await couponAvailable(couponCode)) {
        const retried = await findExisting();
        if (retried) return respondExisting(retried);
        const held = await db.prepare("SELECT * FROM reservations WHERE squirrel_coupon_code=? AND user_id=? AND status='hold'")
          .bind(couponCode, user.id).first<StoredBooking>();
        if (held) await reconcileSquirrelCouponHold(held);
        if (!await couponAvailable(couponCode)) {
          const justCreated = await findExisting();
          if (justCreated) return respondExisting(justCreated);
          throw couponUnavailable();
        }
      }
    }
    const discount = couponCode ? squirrelTicketDiscount(subtotal) : 0;
    const total = subtotal - discount;
    const skipPayment = skipPayDevEnabled();
    if (total > 0 && event.sample === 1 && !skipPayment)
      throw new ApiError(
        409,
        faContent.samplePaymentRejected,
      );
    if (total > 0 && !skipPayment && !paymentReady())
      throw new ApiError(
        503,
        faContent.paymentNotConfigured,
      );
    const now = Date.now();
    const reservationId = crypto.randomUUID();
    const parameters = [reservationId, user.id, event.id, data.quantity, data.requestKey, now, now + 15 * 60000, name, skipPayment ? 1 : 0];
    let booking: StoredBooking | null;
    if (selection) {
      const encoded = JSON.stringify(selection);
      const bookingParameters = [...parameters, encoded, subtotal];
      const result = await db.batch([
        couponCode
          ? db.prepare(reserveTiersWithSquirrelCouponSql).bind(...bookingParameters, couponCode, discount)
          : db.prepare(reserveTiersSql).bind(...bookingParameters),
        db.prepare(insertReservationItemsSql).bind(reservationId, encoded),
      ]);
      booking = (result[0].results[0] as StoredBooking | undefined) ?? null;
    } else {
      booking = couponCode
        ? await db.prepare(reserveWithSquirrelCouponSql).bind(...parameters, subtotal, couponCode, discount).first<StoredBooking>()
        : await db.prepare(reserveSql).bind(...parameters).first<StoredBooking>();
    }
    if (!booking) {
      const retried = await findExisting();
      if (retried) return respondExisting(retried);
      if (couponCode && !await couponAvailable(couponCode)) throw couponUnavailable();
      throw new ApiError(
        409,
        faContent.capacityOrDeadline,
      );
    }
    if (email) await db.prepare("UPDATE reservations SET attendee_email=? WHERE id=? AND user_id=?").bind(email, booking.id, user.id).run();
    if (booking.status === "confirmed") await ensureTickets(booking.id);
    const paymentUrl =
      booking.status === "hold"
        ? await startPayment(booking, user.phone, event.title)
        : null;
    return json({ reservation: booking, paymentUrl }, 201);
  });
