import { config } from "@/db";
import { normalizeInstagramHandle } from "@/lib/instagram";
import { validateImageBytes } from "@/lib/event-media";
import { MAX_IMAGE_BYTES } from "@/lib/media-policy";
import { ApiError } from "@/lib/server";
import { organizerAvatarCopy as t } from "@/locales/organizer-avatar-fa";

// Business Discovery is an authenticated Meta API for professional profiles.
// There is no anonymous official API for an arbitrary personal Instagram ID.
// Secrets remain on the server, never in image URLs or client responses.
export function instagramAvatarConfig() {
  const env = config();
  const account = env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim();
  const token = env.INSTAGRAM_GRAPH_ACCESS_TOKEN?.trim();
  const version = env.INSTAGRAM_GRAPH_API_VERSION?.trim();
  return account && /^\d{1,30}$/.test(account) && token && token.length <= 4096 &&
    version && /^v\d{1,3}\.0$/.test(version) ? { account, token, version } : null;
}

export function instagramImageUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 8192) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        !["cdninstagram.com", "fbcdn.net"].some(domain => host === domain || host.endsWith(`.${domain}`))) return null;
    return url;
  } catch { return null; }
}

async function readBounded(response: Response, limit: number) {
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel().catch(() => {});
    throw new ApiError(502, t.instagramUnavailable);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ApiError(502, t.instagramUnavailable);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function fetchInstagramAvatar(handle: string) {
  const normalized = normalizeInstagramHandle(handle);
  if (!normalized) throw new ApiError(400, t.instagramHandleRequired);
  const connection = instagramAvatarConfig();
  if (!connection) throw new ApiError(503, t.instagramNotConfigured);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const graph = new URL(`https://graph.facebook.com/${connection.version}/${connection.account}`);
    graph.searchParams.set("fields", `business_discovery.username(${normalized}){username,profile_picture_url}`);
    const response = await fetch(graph, {
      headers: { Authorization: `Bearer ${connection.token}`, Accept: "application/json" },
      redirect: "error", signal: controller.signal,
    });
    const result = JSON.parse(new TextDecoder().decode(await readBounded(response, 65536))) as {
      business_discovery?: { username?: unknown; profile_picture_url?: unknown };
    };
    const profile = result.business_discovery;
    // Never attach another account's portrait if Meta resolves an alias or an
    // unexpected response. Do not expose the provider's error or access token.
    if (normalizeInstagramHandle(profile?.username) !== normalized) throw new ApiError(502, t.instagramUnavailable);
    let url = instagramImageUrl(profile?.profile_picture_url);
    if (!url) throw new ApiError(502, t.instagramUnavailable);
    for (let redirect = 0; redirect <= 2; redirect++) {
      const image: Response = await fetch(url, { redirect: "manual", signal: controller.signal, headers: { Accept: "image/jpeg,image/png,image/webp" } });
      if (image.status >= 300 && image.status < 400) {
        const location: string | null = image.headers.get("location");
        await image.body?.cancel().catch(() => {});
        url = location ? instagramImageUrl(new URL(location, url).href) : null;
        if (!url || redirect === 2) throw new ApiError(502, t.instagramUnavailable);
        continue;
      }
      const bytes = await readBounded(image, MAX_IMAGE_BYTES);
      const contentType = validateImageBytes(bytes);
      const declared = image.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (declared && declared !== contentType) throw new ApiError(502, t.instagramUnavailable);
      return { bytes, contentType };
    }
    throw new ApiError(502, t.instagramUnavailable);
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) throw error;
    throw new ApiError(502, t.instagramUnavailable);
  } finally { clearTimeout(timer); }
}
