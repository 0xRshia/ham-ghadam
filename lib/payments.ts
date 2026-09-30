import { faContent, faMessages } from "@/locales/domain-fa";
import { config, database } from "@/db";
import { ApiError, paymentReady, rateLimit } from "./server";
import { confirmSql } from "./booking-sql";
import { MIN_PAID_TOMAN, MAX_ORDER_TOMAN } from "./payment-limits";
import { ensureTickets } from "./tickets";
export type StoredBooking = {
  id: string;
  user_id: string;
  event_id: string;
  quantity: number;
  total: number;
  amount_rial: number;
  status: string;
  request_key: string;
  created_at: number;
  expires_at: number | null;
  authority: string | null;
  reference: string | null;
  payment_state: string;
};
type ProviderResponse = {
  data?: {
    code?: number;
    authority?: string;
    ref_id?: string | number;
    status?: string;
  };
  errors?: { code?: number } | unknown[];
};
async function provider(
  method: string,
  payload: Record<string, unknown>,
): Promise<ProviderResponse> {
  const r = await fetch(
    `https://payment.zarinpal.com/pg/v4/payment/${method}.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        merchant_id: config().ZARINPAL_MERCHANT_ID,
        ...payload,
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
  const result = (await r.json()) as ProviderResponse;
  if (!r.ok && !result.errors) throw Error("Payment service unavailable");
  return result;
}
export async function startPayment(
  booking: StoredBooking,
  phone: string,
  title: string,
) {
  if (
    booking.amount_rial < MIN_PAID_TOMAN * 10 ||
    booking.amount_rial > MAX_ORDER_TOMAN * 10
  )
    throw new ApiError(400, faContent.paymentAmountInvalid);
  if (!paymentReady())
    throw new ApiError(
      503,
      faContent.paymentNotConfigured,
    );
  const c = config();
  let result: ProviderResponse;
  try {
    result = await provider("request", {
      amount: booking.amount_rial,
      currency: "IRR",
      description: faMessages.paymentTicketDescription(String(title)).slice(0, 490),
      callback_url: `${c.APP_ORIGIN!.replace(/\/$/, "")}/api/payments/callback`,
      metadata: { mobile: phone, order_id: booking.id, auto_verify: false },
    });
  } catch {
    await database()
      .prepare(
        "UPDATE reservations SET payment_state='request_unknown' WHERE id=? AND status='hold'",
      )
      .bind(booking.id)
      .run();
    throw new ApiError(
      503,
      faContent.paymentResponseMissing,
    );
  }
  if (result.data?.code !== 100 || !result.data.authority) {
    await database()
      .prepare(
        "UPDATE reservations SET status='failed',payment_state='request_failed' WHERE id=? AND status='hold'",
      )
      .bind(booking.id)
      .run();
    throw new ApiError(
      502,
      faContent.paymentGatewayUnavailable,
    );
  }
  const authority = result.data.authority;
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(authority))
    throw new ApiError(502, faContent.paymentResponseInvalid);
  await database()
    .prepare(
      "UPDATE reservations SET authority=?,payment_state='pending' WHERE id=? AND status='hold'",
    )
    .bind(authority, booking.id)
    .run();
  return `https://payment.zarinpal.com/pg/StartPay/${encodeURIComponent(authority)}`;
}
export async function verifyPayment(booking: StoredBooking) {
  if (booking.status === "confirmed" || booking.payment_state === "paid") {
    if (booking.status === "confirmed") await ensureTickets(booking.id);
    return booking;
  }
  if (!booking.authority || !paymentReady())
    throw new ApiError(409, faContent.noPaymentToCheck);
  const db = database();
  await rateLimit("verify-authority:" + booking.authority, 60, 20000);
  let result: ProviderResponse;
  try {
    result = await provider("verify", {
      amount: booking.amount_rial,
      authority: booking.authority,
    });
  } catch {
    await db
      .prepare(
        "UPDATE reservations SET payment_state='verification_pending' WHERE id=? AND status='hold'",
      )
      .bind(booking.id)
      .run();
    throw new ApiError(
      503,
      faContent.paymentUnknown,
    );
  }
  const code = result.data?.code;
  if (code !== 100 && code !== 101) {
    const error = !Array.isArray(result.errors)
      ? result.errors?.code
      : undefined;
    if (error === -51) {
      await db
        .prepare(
          "UPDATE reservations SET payment_state='not_verified' WHERE id=? AND status='hold'",
        )
        .bind(booking.id)
        .run();
      throw new ApiError(
        409,
        faContent.paymentUnsuccessful,
      );
    }
    await db
      .prepare(
        "UPDATE reservations SET payment_state='verification_pending' WHERE id=? AND status='hold'",
      )
      .bind(booking.id)
      .run();
    throw new ApiError(
      503,
      faContent.paymentVerificationIncomplete,
    );
  }
  const reference = String(result.data?.ref_id ?? "");
  await db.batch([
    db.prepare(confirmSql).bind(booking.id, reference, Date.now()),
    db
      .prepare(
        "UPDATE reservations SET status='paid_unfulfilled',payment_state='paid',reference=? WHERE id=? AND status IN ('hold','failed')",
      )
      .bind(reference, booking.id),
  ]);
  await ensureTickets(booking.id);
  return await db
    .prepare("SELECT * FROM reservations WHERE id=?")
    .bind(booking.id)
    .first<StoredBooking>();
}
