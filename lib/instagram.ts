// Accept a handle or a profile URL, then construct links ourselves. Arbitrary
// URLs, credentials, extra path segments and non-Instagram hosts are rejected.
export function normalizeInstagramHandle(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 254) return null;
  let handle = value.trim();
  if (/^https?:\/\//i.test(handle)) {
    try {
      const url = new URL(handle);
      if (url.protocol !== "https:" || !["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase()) || url.port || url.username || url.password) return null;
      const match = /^\/([^/]+)\/?$/.exec(url.pathname);
      if (!match) return null;
      handle = match[1];
    } catch { return null; }
  }
  handle = handle.replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_](?:[a-z0-9._]{0,28}[a-z0-9_])?$/.test(handle) || handle.includes("..")) return null;
  return handle;
}

export function instagramUrl(handle: string | null | undefined): string | null {
  const normalized = normalizeInstagramHandle(handle);
  return normalized ? `https://www.instagram.com/${normalized}/` : null;
}
