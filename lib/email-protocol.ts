import { createHmac, timingSafeEqual } from "node:crypto";

export type EmailConfiguration = { apiKey:string; from:string; tokenSecret:string; origin:string };
export function emailAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const address = value.trim();
  if (address.length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(address)) return null;
  const [local,domain] = address.split("@");
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  return `${local}@${domain.toLowerCase()}`;
}
export function emailConfiguration(env: Cloudflare.Env): EmailConfiguration | null {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !emailAddress(env.EMAIL_FROM) || !env.EMAIL_TOKEN_SECRET || env.EMAIL_TOKEN_SECRET.length < 32 || !env.APP_ORIGIN) return null;
  try {
    const origin = new URL(env.APP_ORIGIN);
    if (origin.protocol !== "https:" || origin.username || origin.password) return null;
    return { apiKey:env.RESEND_API_KEY,from:env.EMAIL_FROM,tokenSecret:env.EMAIL_TOKEN_SECRET,origin:origin.origin };
  } catch { return null; }
}
export function emailCodeHash(secret: string, id: string, email: string, code: string) {
  return createHmac("sha256",secret).update(JSON.stringify(["email-verification",id,email,code])).digest("hex");
}
export function emailUnsubscribeToken(secret: string, userId: string, email: string, verifiedAt: number) {
  return createHmac("sha256",secret).update(JSON.stringify(["email-unsubscribe",userId,email,verifiedAt])).digest("hex");
}
export function validEmailUnsubscribeToken(token: unknown, expected: string) {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token) && timingSafeEqual(Buffer.from(token,"hex"),Buffer.from(expected,"hex"));
}
export async function sendEmail(configuration: EmailConfiguration, message: { to:string; subject:string; text:string; unsubscribeUrl?:string }, idempotencyKey: string, transport: typeof fetch = fetch): Promise<string> {
  if (!emailAddress(message.to) || /[\r\n]/.test(message.subject) || !/^[A-Za-z0-9:._-]{1,256}$/.test(idempotencyKey)) throw new Error("Invalid email envelope");
  const response = await transport("https://api.resend.com/emails",{
    method:"POST",headers:{ "Content-Type":"application/json",Authorization:`Bearer ${configuration.apiKey}`,"Idempotency-Key":idempotencyKey },
    body:JSON.stringify({ from:configuration.from,to:[message.to],subject:message.subject,text:message.text,
      ...(message.unsubscribeUrl ? { headers:{ "List-Unsubscribe":`<${message.unsubscribeUrl}>`,"List-Unsubscribe-Post":"List-Unsubscribe=One-Click" } } : {}),
    }),redirect:"error",signal:AbortSignal.timeout(5000),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error("Email delivery rejected"); }
  const result = await response.json() as { id?:unknown };
  if (typeof result.id !== "string" || !result.id || result.id.length>128) throw new Error("Email delivery unconfirmed");
  return result.id;
}
