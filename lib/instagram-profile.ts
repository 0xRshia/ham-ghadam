// undefined means invalid input; null clears the optional profile.
export function normalizeInstagramProfile(value: unknown): string | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 2048) return undefined;
  const input = value.trim();
  if (!input) return null;
  let username = input.replace(/^@/, "");
  if (/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i.test(input)) {
    try {
      const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
      if (!["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase()) || url.username || url.password || url.port) return undefined;
      const match = /^\/([A-Za-z0-9._]+)\/?$/.exec(url.pathname);
      if (!match) return undefined;
      username = match[1];
    } catch { return undefined; }
  }
  if (!/^[A-Za-z0-9_](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9_])?$/.test(username) || username.includes("..") ||
      ["p", "reel", "reels", "stories", "explore", "accounts", "direct"].includes(username.toLowerCase())) return undefined;
  return `https://www.instagram.com/${username.toLowerCase()}/`;
}
