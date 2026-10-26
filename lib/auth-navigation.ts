import { loginDestination } from "./login-destination";

export type AuthMode = "login" | "signup" | "forgot";

export function authHomeHref(layout: string | null) {
  return layout === "v1" || layout === "v2" ? `/?layout=${layout}` : "/";
}

export function authHref(path: "/login" | "/signup" | "/forgot-password", next: string | null, layout: string | null) {
  const params = new URLSearchParams();
  if (next && loginDestination(next) === next) params.set("next", next);
  if (layout === "v1" || layout === "v2") params.set("layout", layout);
  return `${path}${params.size ? `?${params}` : ""}`;
}

// Leaving login must return to a public page, rather than another welcome/auth
// screen or a ticket route which immediately sends guests back to login.
export function authBackHref(mode: AuthMode, next: string | null, layout: string | null) {
  if (mode !== "login") return authHref("/login", next, layout);
  if (!next || loginDestination(next) !== next) return authHomeHref(layout);
  return next.replace(/\/tickets$/, "");
}
