/** Only app-owned customer routes may be supplied as login return destinations. */
export function loginDestination(next: string | null, host = false, admin = false) {
  if (host) return "/host";
  if (admin) return next && /^\/admin(?:\/[\w-]+)*(?:\?[^#\s\\]*)?$/.test(next) ? next : "/admin";
  if (next && (
    /^\/(account|reservations)(\?[^#\s\\]*)?$/.test(next) ||
    /^\/events\/[\w-]+(?:\/tickets|\?quantity=[1-6])?$/.test(next) ||
    /^\/(?:organizers|collections)\/[\w-]+$/.test(next) ||
    /^\/(?:favorites|following|notifications)$/.test(next)
  )) return next;
  return "/account";
}
