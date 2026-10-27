import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { origin } from "./config.ts";
import { PASSWORD_HASH, verifyPassword } from "./passwords.ts";
import { getDatabase } from "./store.ts";
import { BlogError } from "./validation.ts";

export const COOKIE = "hg_blog_session";
export const SESSION_AGE = 8 * 60 * 60;
type Session = { hash: string; expiresAt: number };
let activeDerivations = 0;

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function credentials() {
  const username = process.env.BLOG_ADMIN_USERNAME?.trim();
  const passwordHash = process.env.BLOG_ADMIN_PASSWORD_HASH;
  if (!username || username.length > 100 || !passwordHash || !PASSWORD_HASH.test(passwordHash)) {
    throw new BlogError(503, "ورود مدیر پیکربندی نشده است.");
  }
  return { username, passwordHash, fingerprint: digest(JSON.stringify([username, passwordHash])) };
}

export function sessionFromToken(token: string | undefined | null): Session | null {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const { fingerprint } = credentials();
  const row = getDatabase().prepare("SELECT hash,expires_at FROM sessions WHERE hash=? AND fingerprint=? AND expires_at>?")
    .get(digest(token), fingerprint, Date.now());
  return row ? { hash: String(row.hash), expiresAt: Number(row.expires_at) } : null;
}

export async function sessionFromCookies() {
  const { cookies } = await import("next/headers");
  return sessionFromToken((await cookies()).get(COOKIE)?.value);
}

export async function requireAdmin() {
  const session = await sessionFromCookies();
  if (!session) throw new BlogError(401, "برای ادامه وارد پنل مدیریت شوید.");
  return session;
}

function consumeLoginLimits(ip: string) {
  const db = getDatabase();
  const now = Date.now();
  const limits = [
    { key: `ip:${digest(ip)}`, limit: 3, duration: 60 * 60 * 1000 },
    { key: "global", limit: 100, duration: 15 * 60 * 1000 },
  ];
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM login_limits WHERE expires_at<=?").run(now);
    for (const { key, limit } of limits) {
      const row = db.prepare("SELECT attempts FROM login_limits WHERE key=?").get(key);
      if (row && Number(row.attempts) >= limit) {
        throw new BlogError(429, key === "global"
          ? "تلاش‌های ورود زیاد است. پانزده دقیقه بعد دوباره تلاش کنید."
          : "تلاش‌های ورود زیاد است. لطفاً پس از پایان محدودیت یک‌ساعته دوباره تلاش کنید.");
      }
    }
    for (const { key, duration } of limits) {
      db.prepare("INSERT INTO login_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1")
        .run(key, now + duration);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export async function login(username: unknown, password: unknown, ip: string) {
  const expected = credentials();
  consumeLoginLimits(ip);
  if (typeof username !== "string" || username.length > 100 || typeof password !== "string" || password.length > 512) {
    throw new BlogError(401, "نام کاربری یا رمز عبور نادرست است.");
  }
  // Each derivation consumes ~32 MiB; do not queue attacker-controlled scrypt work indefinitely.
  if (activeDerivations >= 2) throw new BlogError(429, "سرویس ورود مشغول است؛ کمی بعد دوباره تلاش کنید.");
  activeDerivations++;
  let valid: boolean;
  try {
    valid = await verifyPassword(password, expected.passwordHash);
  } finally {
    activeDerivations--;
  }
  const sameUsername = timingSafeEqual(Buffer.from(digest(username.trim()), "hex"), Buffer.from(digest(expected.username), "hex"));
  if (!valid || !sameUsername) throw new BlogError(401, "نام کاربری یا رمز عبور نادرست است.");
  const token = randomBytes(32).toString("hex");
  const db = getDatabase();
  db.prepare("DELETE FROM sessions WHERE expires_at<=? OR fingerprint<>?").run(Date.now(), expected.fingerprint);
  db.prepare("INSERT INTO sessions(hash,fingerprint,expires_at) VALUES(?,?,?)")
    .run(digest(token), expected.fingerprint, Date.now() + SESSION_AGE * 1000);
  return token;
}

export function logout(token: string | undefined | null) {
  if (token && /^[a-f0-9]{64}$/.test(token)) getDatabase().prepare("DELETE FROM sessions WHERE hash=?").run(digest(token));
}

export function assertOrigin(request: Request) {
  if (request.headers.get("origin") !== origin()) throw new BlogError(403, "مبدأ درخواست مجاز نیست.");
}

export function trustedIP(request: Request) {
  // This switch is only safe when the backend is loopback-bound and Nginx overwrites X-Real-IP.
  const supplied = process.env.BLOG_TRUST_PROXY === "1" ? request.headers.get("x-real-ip") : null;
  return supplied && isIP(supplied) ? supplied : "local";
}
