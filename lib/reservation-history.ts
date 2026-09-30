import type { Reservation } from "./types";

export type ReservationTab = "past" | "upcoming" | "cancelled";

export function reservationTab(
  reservation: Pick<Reservation, "status" | "ends_at" | "expires_at">,
  now: number,
): ReservationTab {
  if (reservation.status === "confirmed") return reservation.ends_at > now ? "upcoming" : "past";
  // A collected payment still needs attention even after the event has ended.
  if (reservation.status === "paid_unfulfilled" ||
    (reservation.status === "hold" && (reservation.expires_at ?? 0) > now)) return "upcoming";
  return "cancelled";
}

export function groupReservations(reservations: Reservation[], now: number) {
  const groups: Record<ReservationTab, Reservation[]> = { past: [], upcoming: [], cancelled: [] };
  for (const reservation of reservations) groups[reservationTab(reservation, now)].push(reservation);
  return groups;
}
