import { config, database } from "@/db";
import { ApiError, boundary, body, json, rateLimit, requireUser, sameOrigin } from "@/lib/server";
import { emailConfiguration } from "@/lib/email-protocol";
import { requestEmailVerification, verifyAccountEmail } from "@/lib/email-verification";
import { copy } from "@/locales/fa";
export const GET = (req: Request) => boundary(async () => {
  const user=await requireUser(req);
  const account=await database().prepare("SELECT email,verified_at FROM account_emails WHERE user_id=?").bind(user.id).first();
  return json({ configured:!!emailConfiguration(config()),account });
});
export const POST = (req: Request) => boundary(async () => {
  sameOrigin(req); const user=await requireUser(req),data=await body(req,3000);
  if (data.action==="request") return json(await requestEmailVerification(req,user.id,data.email));
  if (data.action==="verify") {
    await rateLimit(`email-verify:${user.id}`,30);
    return json(await verifyAccountEmail(user.id,data.challengeId,data.code));
  }
  throw new ApiError(400,copy.emailInvalid);
});
export const DELETE = (req: Request) => boundary(async () => {
  sameOrigin(req);const user=await requireUser(req),db=database();
  await db.batch([
    db.prepare("UPDATE user_profiles SET notification_preferences=json_set(notification_preferences,'$.email',json('false'),'$.newsletter',json('false')),updated_at=? WHERE user_id=?").bind(Date.now(),user.id),
    db.prepare("DELETE FROM email_deliveries WHERE notification_id IN (SELECT id FROM notifications WHERE user_id=?)").bind(user.id),
    db.prepare("DELETE FROM account_emails WHERE user_id=?").bind(user.id),
    db.prepare("DELETE FROM email_challenges WHERE user_id=?").bind(user.id),
  ]);
  return json({ok:true});
});
