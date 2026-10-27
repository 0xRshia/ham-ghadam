import { timingSafeEqual } from "node:crypto";
import { config, database } from "@/db";
import { ApiError, hash, randomToken, rateLimit } from "@/lib/server";
import { verifyPassword } from "@/lib/passwords";
import { fastCopy } from "@/locales/fast-fa";

const COOKIE = "hg_fast_session";
const SESSION_AGE = 8 * 60 * 60;
const PASSWORD_HASH = /^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/;

export function fastCredentials() {
  const username = config().FAST_ADMIN_USERNAME?.trim();
  const passwordHash = config().FAST_ADMIN_PASSWORD_HASH;
  return username && username.length <= 100 && passwordHash && PASSWORD_HASH.test(passwordHash)
    ? { username, passwordHash } : null;
}

async function credentialFingerprint() {
  const credentials = fastCredentials();
  if (!credentials) throw new ApiError(503, fastCopy.notConfigured);
  return hash(JSON.stringify([credentials.username, credentials.passwordHash]));
}

function tokenFromCookie(cookie: string | null) {
  const token = cookie?.split(";").map(value => value.trim()).find(value => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export async function fastSession(cookie: string | null) {
  const fingerprint = await credentialFingerprint();
  const token = tokenFromCookie(cookie);
  if (!token) return null;
  return database().prepare("SELECT hash,expires_at FROM fast_sessions WHERE hash=? AND credential_fingerprint=? AND expires_at>?")
    .bind(await hash(token), fingerprint, Date.now()).first<{ hash: string; expires_at: number }>();
}

export async function requireFast(req: Request, write = false) {
  const session = await fastSession(req.headers.get("cookie"));
  if (!session) throw new ApiError(401, fastCopy.loginRequired);
  if (write) await rateLimit(`fast-write:${session.hash}`, 100, 100);
  return session;
}

export function fastCookie(req: Request, token: string, age = SESSION_AGE) {
  return `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${age}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}

export async function loginFast(req: Request, data: Record<string, unknown>) {
  const credentials = fastCredentials();
  if (!credentials) throw new ApiError(503, fastCopy.notConfigured);
  const ip = await hash(req.headers.get("cf-connecting-ip") ?? "local");
  await rateLimit(`fast-login:${ip}`, 3);
  if (typeof data.username !== "string" || data.username.length > 100 || typeof data.password !== "string" || data.password.length > 512)
    throw new ApiError(401, fastCopy.invalidCredentials);
  // Always derive the password, including wrong usernames, to avoid an account oracle.
  const valid = await verifyPassword(data.password, credentials.passwordHash);
  const supplied = Buffer.from(await hash(data.username.trim()), "hex");
  const expected = Buffer.from(await hash(credentials.username), "hex");
  if (!timingSafeEqual(supplied, expected) || !valid) throw new ApiError(401, fastCopy.invalidCredentials);
  const token = randomToken();
  await database().batch([
    database().prepare("DELETE FROM fast_sessions WHERE expires_at<=? OR credential_fingerprint<>?").bind(Date.now(), await credentialFingerprint()),
    database().prepare("INSERT INTO fast_sessions(hash,credential_fingerprint,expires_at) VALUES(?,?,?)")
      .bind(await hash(token), await credentialFingerprint(), Date.now() + SESSION_AGE * 1000),
  ]);
  return token;
}

export async function logoutFast(req: Request) {
  const token = tokenFromCookie(req.headers.get("cookie"));
  if (token) await database().prepare("DELETE FROM fast_sessions WHERE hash=?").bind(await hash(token)).run();
}
