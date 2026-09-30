import { database, config } from "@/db";
import { verifyPayment, type StoredBooking } from "@/lib/payments";
import { ensureTickets } from "@/lib/tickets";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const authority = url.searchParams.get("Authority");
  let outcome = "pending";
  let reservationId = "";
  try {
    if (authority && authority.length <= 100) {
      const booking = await database()
        .prepare("SELECT * FROM reservations WHERE authority=?")
        .bind(authority)
        .first<StoredBooking>();
      if (booking) {
        reservationId = booking.id;
        if (booking.status === "confirmed") {
          await ensureTickets(booking.id);
          outcome = "success";
        }
        else if (url.searchParams.get("Status") === "OK") {
          const result = await verifyPayment(booking);
          outcome = result?.status === "confirmed" ? "success" : "review";
        } else outcome = "cancelled";
      }
    }
  } catch {
    outcome = "pending";
  }
  return Response.redirect(
    `${config().APP_ORIGIN || url.origin}/reservations?payment=${outcome}${reservationId ? `&reservation=${encodeURIComponent(reservationId)}` : ""}`,
    303,
  );
}
