import { createECDH, ECDH } from "node:crypto";
import webPush from "web-push";

export type BrowserSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushConfiguration = { publicKey: string; privateKey: string; subject: string };

function keyBytes(value: unknown, length: number) {
  if (typeof value !== "string" || !/^[\w-]+$/.test(value)) return null;
  const bytes = Buffer.from(value, "base64url");
  return bytes.length === length && bytes.toString("base64url") === value ? bytes : null;
}
export function allowedPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    // Only browser vendors' push services are outbound destinations, never arbitrary URLs.
    return url.protocol === "https:" && !url.port && !url.username && !url.password && !url.hash &&
      (url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com" ||
       url.hostname.endsWith(".push.apple.com") || url.hostname.endsWith(".notify.windows.com"));
  } catch { return false; }
}
export function parseBrowserSubscription(value: unknown): BrowserSubscription | null {
  if (!value || typeof value !== "object") return null;
  const subscription = value as Partial<BrowserSubscription>;
  if (!allowedPushEndpoint(subscription.endpoint)) return null;
  const key = keyBytes(subscription.keys?.p256dh, 65);
  if (!key || key[0] !== 4 || !keyBytes(subscription.keys?.auth, 16)) return null;
  try { ECDH.convertKey(key, "prime256v1"); } catch { return null; }
  return { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys!.p256dh, auth: subscription.keys!.auth } };
}
export function pushConfiguration(env: Cloudflare.Env): PushConfiguration | null {
  const publicKey = keyBytes(env.VAPID_PUBLIC_KEY, 65), privateKey = keyBytes(env.VAPID_PRIVATE_KEY, 32);
  if (!publicKey || !privateKey || !env.VAPID_SUBJECT) return null;
  try {
    const subject = new URL(env.VAPID_SUBJECT);
    if (!(["https:", "mailto:"].includes(subject.protocol)) || !subject.pathname) return null;
    const key = createECDH("prime256v1");
    key.setPrivateKey(privateKey);
    if (!key.getPublicKey().equals(publicKey)) return null;
    return { publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY!, subject: env.VAPID_SUBJECT };
  } catch { return null; }
}
export function encryptedPushRequest(subscription: BrowserSubscription, payload: { id: string; title: string; message: string; href: string }, configuration: PushConfiguration) {
  if (!parseBrowserSubscription(subscription)) throw new Error("Invalid push subscription");
  const details = webPush.generateRequestDetails(subscription, JSON.stringify(payload), {
    vapidDetails: configuration, contentEncoding: "aes128gcm", TTL: 300, urgency: "normal",
  });
  return { endpoint: details.endpoint, init: {
    method: details.method,
    headers: Object.fromEntries(Object.entries(details.headers).filter(([key]) => key.toLowerCase() !== "content-length").map(([key,value]) => [key,String(value)])),
    body: details.body ? new Uint8Array(details.body) : null,
    redirect: "error" as const,
    signal: AbortSignal.timeout(5000),
  } };
}
