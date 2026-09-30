import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { boundary, body, sameOrigin, ApiError, createSession, rateLimit, hash } from "@/lib/server";
import { consumePhoneVerification } from "@/lib/phone-verification";
import { validPassword, hashPassword } from "@/lib/passwords";
export const POST = (req: Request) => boundary(async () => {
  sameOrigin(req); const data=await body(req);
  if (!validPassword(data.password)) throw new ApiError(400,faContent.passwordLength);
  if (typeof data.name !== "string" || data.name.trim().length < 2 || data.name.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(data.name)) throw new ApiError(400,faContent.invalidName);
  await rateLimit("register-ip:"+await hash(req.headers.get("cf-connecting-ip") ?? "local"),20);
  const phone=await consumePhoneVerification(req,data.challengeId,data.code);
  const db=database();
  if(await db.prepare("SELECT c.user_id FROM password_credentials c JOIN users u ON u.id=c.user_id WHERE u.phone=?").bind(phone).first())throw new ApiError(409,faContent.accountExists);
  const passwordHash=await hashPassword(data.password);const now=Date.now();
  await db.batch([
    db.prepare("INSERT INTO users(id,phone,name,created_at) VALUES(?,?,?,?) ON CONFLICT(phone) DO NOTHING").bind(crypto.randomUUID(),phone,data.name.trim(),now),
    db.prepare("INSERT INTO password_credentials(user_id,password_hash,updated_at) SELECT id,?,? FROM users WHERE phone=? ON CONFLICT(user_id) DO NOTHING").bind(passwordHash,now,phone),
  ]);
  return createSession(req,phone,data.name);
});
