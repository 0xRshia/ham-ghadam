import { isOrganizerLoginDestination } from "./organizer-navigation";
import { isManshaSellerOrderPath } from "./mansha-navigation";

/** Restrict login return destinations to known app routes. */
export function loginDestination(next: string | null, host = false, admin = false) {
  if (next && isManshaSellerOrderPath(next)) return next;
  if (host) return "/host";
  if (admin) return next && /^\/admin(?:\/[\w-]+)*(?:\?[^#\s\\]*)?$/.test(next) ? next : "/admin";
  if (next && (
    /^\/(account|reservations)(\?[^#\s\\]*)?$/.test(next) ||
    /^\/events\/[\w-]+(?:\/tickets|\?quantity=[1-6])?$/.test(next) ||
    isOrganizerLoginDestination(next) ||
    /^\/collections\/[\w-]+$/.test(next) ||
    /^\/(?:favorites|following|notifications)$/.test(next)
  )) return next;
  return "/account";
}
