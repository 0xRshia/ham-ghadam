import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const prefix = "scrypt$32768$8$3";
export const dummyPasswordHash = `${prefix}$${"00".repeat(16)}$${"00".repeat(64)}`;
export function validPassword(value: unknown): value is string {
  return typeof value === "string" && Array.from(value).length >= 12 && Array.from(value).length <= 128;
}
function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve,reject) => scrypt(password,salt,64,options,(error,key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const digest = await derive(password,salt);
  return `${prefix}$${salt.toString("hex")}$${digest.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const match = /^scrypt\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded);
  if (!match) return false;
  const digest = await derive(password,Buffer.from(match[1],"hex"));
  return timingSafeEqual(digest,Buffer.from(match[2],"hex"));
}
