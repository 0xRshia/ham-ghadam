import { config, database } from "@/db";
import { boundary, json } from "@/lib/server";
import { emailUnsubscribeToken, validEmailUnsubscribeToken } from "@/lib/email-protocol";
import { copy } from "@/locales/fa";
import { discardEventRequest } from "@/lib/event-media";
export const GET = (req: Request) => {
  const url=new URL(req.url);url.pathname="/email/unsubscribe";
  return new Response(null,{status:303,headers:{Location:url.href,"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
};
export const POST = (req: Request) => boundary(async () => {
  // Email clients perform one-click POSTs cross-origin. The scoped HMAC is the authorization.
  // Consume their form body so Workerd can safely reuse the request connection.
  await discardEventRequest(req,2048);
  const params=new URL(req.url).searchParams,secret=config().EMAIL_TOKEN_SECRET;
  const userId=params.get("user"),token=params.get("token");
  if (!secret || secret.length<32 || !userId || userId.length>80) return json({error:copy.emailUnsubscribeInvalid},400);
  const db=database(),account=await db.prepare("SELECT email,verified_at FROM account_emails WHERE user_id=?").bind(userId).first<{email:string;verified_at:number}>();
  if (!account || !validEmailUnsubscribeToken(token,emailUnsubscribeToken(secret,userId,account.email,account.verified_at))) return json({error:copy.emailUnsubscribeInvalid},400);
  await db.batch([
    db.prepare("UPDATE user_profiles SET notification_preferences=json_set(notification_preferences,'$.email',json('false'),'$.newsletter',json('false')),updated_at=? WHERE user_id=? AND EXISTS(SELECT 1 FROM account_emails WHERE user_id=? AND email=? AND verified_at=?)").bind(Date.now(),userId,userId,account.email,account.verified_at),
    db.prepare("UPDATE account_emails SET enabled_at=NULL WHERE user_id=? AND email=? AND verified_at=?").bind(userId,account.email,account.verified_at),
  ]);
  return json({ok:true});
});
