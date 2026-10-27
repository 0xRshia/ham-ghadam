// undefined rejects invalid input; null clears the optional teaser.
export function normalizeEventTeaser(value: unknown): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > 2048) return undefined;
  const input = value.trim();
  if (!input) return null;
  if (/[\s\u0000-\u001f\u007f\\]/.test(input) || !/^https:\/\//i.test(input)) return undefined;
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        !url.hostname.includes(".") || url.hostname.endsWith(".") || url.hostname.endsWith(".localhost") ||
        url.hostname.endsWith(".local") || /^\d+(\.\d+){3}$/.test(url.hostname)) return undefined;
    return url.href;
  } catch { return undefined; }
}
