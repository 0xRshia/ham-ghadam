import type { NotificationItem } from "./community-types";

export type NotificationGroup = "all" | "organizer" | "tickets" | "collection" | "favorite" | "events" | "other";

export function notificationGroup(kind: string): Exclude<NotificationGroup, "all"> {
  switch (kind) {
    case "booking": case "reminder": return "tickets";
    case "organizer": case "collection": case "favorite": return kind;
    case "newsletter": return "events";
    default: return "other";
  }
}

/** Keep the API's related destination, with direct access to a purchased reservation. */
export function notificationDestination(item: Pick<NotificationItem, "kind" | "href">): string | null {
  if (!item.href.startsWith("/") || item.href.startsWith("//")) return null;
  const origin = "https://hmghadam.local";
  let target: URL;
  try { target = new URL(item.href, origin); } catch { return null; }
  if (target.origin !== origin) return null;
  if (!/^\/(events|reservations|collections|organizers|following)(\/|$)/.test(target.pathname)) return null;
  const reservation = target.searchParams.get("booked");
  if (item.kind === "booking" && target.pathname === "/reservations" && reservation) {
    return "/reservations/" + encodeURIComponent(reservation);
  }
  return target.pathname + target.search + target.hash;
}
