import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { boundary, body, sameOrigin, ApiError, createSession, rateLimit, hash, randomToken, json } from "@/lib/server";
import { consumePhoneVerification } from "@/lib/phone-verification";
import { validPassword, hashPassword } from "@/lib/passwords";
export const POST = (req: Request) => boundary(async () => {
  sameOrigin(req);const data=await body(req);
  await rateLimit("reset-ip:"+await hash(req.headers.get("cf-connecting-ip") ?? "local"),20);
  const db=database();
  if(data.action === "verify") {
    const phone=await consumePhoneVerification(req,data.challengeId,data.code);
    const user=await db.prepare("SELECT id FROM users WHERE phone=?").bind(phone).first<{id:string}>();
    if(!user)throw new ApiError(400,faContent.createAccountFirst);
    const token=randomToken();
    await db.batch([
      db.prepare("DELETE FROM password_reset_grants WHERE user_id=? OR expires_at<=?").bind(user.id,Date.now()),
      db.prepare("INSERT INTO password_reset_grants VALUES(?,?,?)").bind(await hash(token),user.id,Date.now()+300000),
    ]);
    return json({ resetToken: token });
  }
  if(!validPassword(data.password))throw new ApiError(400,faContent.passwordLength);
  if(typeof data.resetToken !== "string" || !/^[a-f0-9]{64}$/.test(data.resetToken))throw new ApiError(400,faContent.verifyPhoneAgain);
  const tokenHash=await hash(data.resetToken);
  if(!await db.prepare("SELECT hash FROM password_reset_grants WHERE hash=? AND expires_at>?").bind(tokenHash,Date.now()).first())throw new ApiError(400,faContent.codeExpired);
  const encoded=await hashPassword(data.password);
  const grant=await db.prepare("DELETE FROM password_reset_grants WHERE hash=? AND expires_at>? RETURNING user_id").bind(tokenHash,Date.now()).first<{user_id:string}>();
  if(!grant)throw new ApiError(400,faContent.codeExpired);
  const user=await db.prepare("SELECT id,phone,name FROM users WHERE id=?").bind(grant.user_id).first<{id:string;phone:string;name:string}>();
  if(!user)throw new ApiError(400,faContent.accountUnavailable);
  await db.batch([
    db.prepare("INSERT INTO password_credentials VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash,updated_at=excluded.updated_at").bind(user.id,encoded,Date.now()),
    db.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id),
  ]);
  return createSession(req,user.phone,user.name);
});
