const localOrigin = "https://hamghadam.invalid";
const fallback = "/events";
const maxReturnLength = 2048;

function localReturnUrl(value: string | null | undefined) {
  if (!value || value.length > maxReturnLength || !value.startsWith("/") || value.startsWith("//") || /[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, localOrigin);
    const pathname = decodeURIComponent(url.pathname);
    if (url.origin !== localOrigin || pathname.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(pathname)) return null;
    return url;
  } catch { return null; }
}

/** A bounded, local return destination which does not recursively embed profiles. */
export function organizerReturnPath(value: string | null | undefined) {
  const url = localReturnUrl(value);
  if (!url) return fallback;
  if (/^\/organizers\/[^/]+\/?$/.test(url.pathname)) url.searchParams.delete("from");
  return url.pathname + url.search + url.hash;
}

export function organizerProfileHref(id: string, from?: string | null) {
  const profile = `/organizers/${encodeURIComponent(id)}`;
  if (!from) return profile;
  const back = organizerBackHref(id, from);
  const destination = `${profile}?from=${encodeURIComponent(back)}`;
  return destination.length <= maxReturnLength ? destination : `${profile}?from=${encodeURIComponent(fallback)}`;
}

export function organizerBackHref(id: string, from?: string | null) {
  const destination = organizerReturnPath(from);
  const url = new URL(destination, localOrigin);
  // A copied or edited query must not make the profile's back arrow reopen itself.
  try {
    if (decodeURIComponent(url.pathname).replace(/\/$/, "") === `/organizers/${id}`) return fallback;
  } catch { return fallback; }
  return destination;
}

/** Accept the profile link (including its validated origin) through guest login. */
export function isOrganizerLoginDestination(value: string) {
  const url = localReturnUrl(value);
  if (!url || url.hash || !/^\/organizers\/[^/]+$/.test(url.pathname)) return false;
  const id = decodeURIComponent(url.pathname.slice("/organizers/".length));
  if (!id || /[/\\?#\s]/.test(id)) return false;
  if ([...url.searchParams.keys()].some(key => key !== "from") || url.searchParams.getAll("from").length > 1) return false;
  const from = url.searchParams.get("from");
  return from === null || (!!localReturnUrl(from) && organizerBackHref(id, from) === from);
}
