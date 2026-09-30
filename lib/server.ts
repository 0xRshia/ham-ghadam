import { faContent } from "@/locales/domain-fa";
import { database, config } from "@/db";
import { digits, type User } from "@/lib/types";
import { temporaryAccount } from "@/lib/temporary-login";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
export async function boundary(work: () => Promise<Response>) {
  try {
    return await work();
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message }, e.status);
    console.error("Request failed", e instanceof Error ? e.name : "Unknown");
    return json(
      { error: faContent.serviceUnavailable },
      503,
    );
  }
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const expected = new URL(req.url).origin;
  if (origin !== expected && origin !== config().APP_ORIGIN)
    throw new ApiError(403, faContent.invalidRequestReload);
  if (!origin) throw new ApiError(403, faContent.invalidRequest);
}
export async function body(req: Request, maxBytes = 16000) {
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes)
    throw new ApiError(413, faContent.enteredTextTooLong);
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes)
    throw new ApiError(413, faContent.enteredTextTooLong);
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid JSON object");
    return value;
  } catch {
    throw new ApiError(400, faContent.invalidRequestInformation);
  }
}
export function phoneNumber(value: unknown) {
  if (typeof value !== "string")
    throw new ApiError(400, faContent.phoneRequired);
  let p = digits(value).replace(/[\s-]/g, "");
  if (p.startsWith("+98")) p = "0" + p.slice(3);
  else if (p.startsWith("0098")) p = "0" + p.slice(4);
  if (!/^09\d{9}$/.test(p))
    throw new ApiError(400, faContent.phoneFormat);
  return p;
}
export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
export async function otpHash(id: string, phone: string, code: string) {
  const secret = config().OTP_SECRET;
  if (!secret || secret.length < 32)
    throw new ApiError(
      503,
      faContent.smsUnavailable,
    );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${id}:${phone}:${code}`),
      ),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
export function isHost(phone: string) {
  // TODO(PRODUCTION): REMOVE_TEMP_LOGIN — temporary roles must also apply to session lookups.
  const temporary = temporaryAccount(phone);
  if (temporary) return temporary.isHost;
  return (config().HOST_PHONES ?? "")
    .split(",")
    .map((x) => x.trim())
    .includes(phone);
}
export function isAdmin(phone: string) {
  return (config().ADMIN_PHONES ?? "").split(",").some((value) => {
    try { return phoneNumber(value.trim()) === phone; }
    catch { return false; }
  });
}

export async function requireAdmin(req: Request) {
  const user = await requireUser(req);
  if (!user.isAdmin) throw new ApiError(403, faContent.adminAccessInactive);
  return user;
}
export async function requestSessionHash(req: Request): Promise<string | null> {
  const token = req.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("hg_session="))
    ?.slice(11);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return hash(token);
}
export async function currentUser(req: Request): Promise<User | null> {
  const sessionHash = await requestSessionHash(req);
  if (!sessionHash) return null;
  const user = await database()
    .prepare(
      "SELECT u.id,u.phone,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires_at>?",
    )
    .bind(sessionHash, Date.now())
    .first<{ id: string; phone: string; name: string }>();
  return user ? { ...user, isHost: isHost(user.phone), isAdmin: isAdmin(user.phone) } : null;
}
export async function requireUser(req: Request, host = false) {
  const user = await currentUser(req);
  if (!user) throw new ApiError(401, faContent.loginRequired);
  if (host && !user.isHost)
    throw new ApiError(403, faContent.hostUnverified);
  return user;
}
export function sessionCookie(req: Request, token: string, age: number) {
  return `hg_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${age}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}
export async function createSession(
  req: Request,
  phone: string,
  suppliedName: unknown,
  defaultName = "",
) {
  const db = database();
  const token = randomToken();
  const now = Date.now();
  const age = 30 * 86400;
  const name =
    (typeof suppliedName === "string" ? suppliedName.trim().slice(0, 80) : "") ||
    defaultName;
  await db.batch([
    db
      .prepare(
        "INSERT INTO users(id,phone,name,created_at) VALUES(?,?,?,?) ON CONFLICT(phone) DO UPDATE SET name=CASE WHEN users.name='' THEN excluded.name ELSE users.name END",
      )
      .bind(crypto.randomUUID(), phone, name, now),
    db
      .prepare(
        "INSERT INTO sessions(hash,user_id,expires_at) SELECT ?,id,? FROM users WHERE phone=?",
      )
      .bind(await hash(token), now + age * 1000, phone),
  ]);
  const user = await db
    .prepare("SELECT id,phone,name FROM users WHERE phone=?")
    .bind(phone)
    .first<Omit<User, "isHost" | "isAdmin">>();
  if (!user) throw new Error("Session user unavailable");
  return json({ user: { ...user, isHost: isHost(phone), isAdmin: isAdmin(phone) } }, 200, {
    "Set-Cookie": sessionCookie(req, token, age),
  });
}
export async function rateLimit(key: string, max: number, cooldown = 0) {
  const now = Date.now();
  const result = await database()
    .prepare(
      `INSERT INTO rate_limits(key,count,resets_at,last_at) VALUES(?1,1,?2,?3) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN resets_at<=?3 THEN 1 ELSE count+1 END,resets_at=CASE WHEN resets_at<=?3 THEN ?2 ELSE resets_at END,last_at=?3 WHERE (resets_at<=?3 OR count<?4) AND last_at<=?5 RETURNING key`,
    )
    .bind(key, now + 3600000, now, max, now - cooldown)
    .first();
  if (!result)
    throw new ApiError(
      429,
      faContent.rateLimit,
    );
}
export function smsReady() {
  const c = config();
  return !!(
    c.KAVENEGAR_API_KEY &&
    c.KAVENEGAR_TEMPLATE &&
    c.OTP_SECRET &&
    c.OTP_SECRET.length >= 32
  );
}
export function paymentReady() {
  const c = config();
  return !!(c.ZARINPAL_MERCHANT_ID && c.APP_ORIGIN?.startsWith("https://"));
}
export function skipPayDevEnabled() {
  return config().SKIP_PAY_DEV === "true";
}
