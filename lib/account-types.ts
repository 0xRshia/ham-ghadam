import { faMessages, faContent } from "@/locales/domain-fa";
import type { Reservation } from "@/lib/types";

export function confirmedReservationSql(alias = "") {
  return `${alias}status='confirmed'`;
}

export function outstandingReservationSql(alias = "") {
  return `((${alias}status='hold' AND ${alias}expires_at>?) OR ${alias}status='paid_unfulfilled')`;
}

export type AccountSummary = {
  user: { id: string; phone: string; name: string; isHost: boolean; isAdmin: boolean };
  latestPurchase: Reservation | null;
  latestOutstanding: Reservation | null;
  reservationCount: number;
  confirmedCount: number;
  outstandingCount: number;
  serverNow: number;
};

export type ReceiptResponse = {
  receipt: {
    id: string;
    event_id: string;
    title: string;
    venue: string;
    address: string;
    city: string;
    starts_at: number;
    ends_at: number;
    quantity: number;
    total: number;
    status: string;
    payment_state: string;
    reference: string | null;
    created_at: number;
    expires_at: number | null;
    name: string;
    phone: string;
  };
  serverNow?: number;
};

export function reservationStatusLabel(status: string, paymentState: string, total: number, endsAt: number, now: number) {
  if (status === "confirmed") {
    if (total === 0) return endsAt > now ? faContent.confirmedFreeBooking : faContent.heldEvent;
    if (paymentState === "skipped_dev") return faContent.confirmedWithoutPayment;
    if (paymentState === "paid") return endsAt > now ? faContent.paymentConfirmedBooking : faContent.paymentConfirmedPast;
    return endsAt > now ? faContent.confirmedBooking : faContent.heldEvent;
  }
  if (status === "paid_unfulfilled") return faContent.paidBookingFollowup;
  if (status === "hold") {
    if (endsAt <= now) return faContent.reservationDeadlinePassed;
    if (paymentState === "verification_pending") return faContent.paymentVerificationPendingLabel;
    if (paymentState === "not_verified") return faContent.paymentUnconfirmed;
    if (paymentState === "requesting" || paymentState === "request_unknown") return faContent.preparingPayment;
    return faContent.awaitingPayment;
  }
  if (status === "cancelled") return faContent.cancelled;
  if (paymentState === "paid") return faContent.paidBookingFailed;
  return faContent.paymentFailed;
}

export function reservationAmountLabel(status: string, paymentState: string, total: number) {
  if (total === 0) return faContent.free;
  if (paymentState === "skipped_dev") return faContent.noFundsReceived;
  if (paymentState === "paid") return faMessages.amountPaid(String(new Intl.NumberFormat("fa-IR").format(total)));
  if (status === "hold") return faMessages.amountDue(String(new Intl.NumberFormat("fa-IR").format(total)));
  return faMessages.reservationAmount(String(new Intl.NumberFormat("fa-IR").format(total)));
}
