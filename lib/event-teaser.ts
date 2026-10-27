// A teaser is an Instagram post/reel link, separate from both profile identity
// and the optional directly playable event_programs.video_url. Never fetch it.
// undefined means invalid input; null removes this optional field.
export function normalizeEventTeaser(value: unknown): string | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 2048) return undefined;
  const input = value.trim();
  if (!input) return null;
  if (!/^https:\/\//i.test(input) || /[\\\u0000-\u0020\u007f]/.test(input)) return undefined;
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || !["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase()) ||
        url.username || url.password || url.port) return undefined;
    const post = /^\/(reel|p|tv)\/([A-Za-z0-9_-]{1,64})\/?$/.exec(url.pathname);
    return post ? `https://www.instagram.com/${post[1]}/${post[2]}/` : undefined;
  } catch { return undefined; }
}
