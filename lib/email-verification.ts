import { randomInt } from "node:crypto";
import { config, database } from "@/db";
import { ApiError, rateLimit, hash } from "@/lib/server";
import { digits } from "@/lib/types";
import { copy } from "@/locales/fa";
import { emailAddress, emailCodeHash, emailConfiguration, sendEmail } from "./email-protocol";

export async function requestEmailVerification(req: Request, userId: string, value: unknown) {
  const email = emailAddress(value);
  if (!email) throw new ApiError(400,copy.emailInvalid);
  const configuration = emailConfiguration(config());
  if (!configuration) throw new ApiError(503,copy.emailUnconfigured);
  await rateLimit(`email-user:${userId}`,5,60000);
  await rateLimit("email-recipient:"+await hash(email.toLowerCase()),5,60000);
  await rateLimit("email-ip:"+await hash(req.headers.get("cf-connecting-ip") ?? "local"),20);
  const db=database(), id=crypto.randomUUID(),code=String(randomInt(100000,1000000)),now=Date.now();
  await db.prepare("INSERT INTO email_challenges(id,user_id,email,hash,created_at,expires_at) VALUES(?,?,?,?,?,?)")
    .bind(id,userId,email,emailCodeHash(configuration.tokenSecret,id,email,code),now,now+600000).run();
  try {
    await sendEmail(configuration,{to:email,subject:copy.emailVerificationSubject,text:`${copy.emailVerificationBody}\n\n${code}\n\n${copy.emailVerificationExpiry}`},`email-verification:${id}`);
  } catch {
    await db.prepare("DELETE FROM email_challenges WHERE id=?").bind(id).run();
    throw new ApiError(503,copy.emailDeliveryFailed);
  }
  // Replace older codes only after the provider accepts the new message.
  await db.prepare("UPDATE email_challenges SET consumed=1 WHERE user_id=? AND id<>? AND consumed=0").bind(userId,id).run();
  return { challengeId:id,email,expiresAt:now+600000,resendAt:now+60000 };
}
export async function verifyAccountEmail(userId: string, challengeId: unknown, suppliedCode: unknown) {
  const secret=config().EMAIL_TOKEN_SECRET;
  if (!secret || secret.length<32) throw new ApiError(503,copy.emailUnconfigured);
  const code=digits(String(suppliedCode ?? ""));
  if (typeof challengeId!=="string" || challengeId.length>80 || !/^\d{6}$/.test(code)) throw new ApiError(400,copy.emailCodeInvalid);
  const db=database(),now=Date.now();
  const challenge=await db.prepare("UPDATE email_challenges SET attempts=attempts+1 WHERE id=? AND user_id=? AND consumed=0 AND attempts<5 AND expires_at>? RETURNING email")
    .bind(challengeId,userId,now).first<{email:string}>();
  if (!challenge) throw new ApiError(400,copy.emailCodeExpired);
  const encoded=emailCodeHash(secret,challengeId,challenge.email,code);
  const predicate="id=?1 AND user_id=?2 AND hash=?3 AND consumed=0 AND expires_at>?4";
  const results=await db.batch([
    db.prepare(`INSERT INTO account_emails(user_id,email,verified_at,enabled_at) SELECT user_id,email,?4,NULL FROM email_challenges WHERE ${predicate}
      ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,verified_at=excluded.verified_at,enabled_at=NULL`).bind(challengeId,userId,encoded,now),
    db.prepare(`INSERT INTO user_profiles(user_id,notification_preferences,updated_at) SELECT user_id,'{"events":true,"reminders":true,"following":true,"email":false,"newsletter":false}',?4 FROM email_challenges WHERE ${predicate}
      ON CONFLICT(user_id) DO UPDATE SET notification_preferences=json_set(user_profiles.notification_preferences,'$.email',json('false'),'$.newsletter',json('false')),updated_at=excluded.updated_at`).bind(challengeId,userId,encoded,now),
    db.prepare(`DELETE FROM email_deliveries WHERE notification_id IN (SELECT id FROM notifications WHERE user_id=?2) AND EXISTS(SELECT 1 FROM email_challenges WHERE ${predicate})`).bind(challengeId,userId,encoded,now),
    db.prepare(`UPDATE email_challenges SET consumed=1 WHERE ${predicate} RETURNING id`).bind(challengeId,userId,encoded,now),
  ]);
  if (!results[3].results.length) throw new ApiError(400,copy.emailCodeInvalid);
  return { email:challenge.email,verifiedAt:now };
}
