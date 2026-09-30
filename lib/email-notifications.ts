import { config, database } from "@/db";
import { copy } from "@/locales/fa";
import { notificationAudienceCondition } from "./notification-queries";
import { emailConfiguration, emailUnsubscribeToken, sendEmail } from "./email-protocol";

const newsletterEventTitlesSql = `(SELECT group_concat(title,' • ') FROM (
   SELECT e.title FROM events e WHERE e.published=1 AND e.sample=0 AND e.starts_at>?1 AND e.starts_at<=?1+604800000
   AND (p.city='' OR e.city=p.city) AND (json_array_length(p.interests)=0 OR e.category IN (SELECT value FROM json_each(p.interests)))
   ORDER BY e.starts_at,e.id LIMIT 3))`;
export const newsletterSql = `INSERT INTO notifications(id,user_id,kind,title,message,href,deduplication_key,created_at)
 SELECT 'newsletter:'||user_id||':'||?3,user_id,'newsletter',?2,message,'/events?view=all','newsletter:'||?3,?1 FROM (
 SELECT p.user_id,${newsletterEventTitlesSql} message
 FROM user_profiles p JOIN account_emails a ON a.user_id=p.user_id
 WHERE json_extract(p.notification_preferences,'$.email')=1 AND json_extract(p.notification_preferences,'$.newsletter')=1 AND a.enabled_at IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.user_id=p.user_id AND n.deduplication_key='newsletter:'||?3)
 ) WHERE message IS NOT NULL LIMIT 100 ON CONFLICT(user_id,deduplication_key) DO NOTHING`;
export const emailAudienceSql = `SELECT n.id,n.user_id,n.title,n.message,n.href,a.email,a.verified_at
 FROM notifications n JOIN account_emails a ON a.user_id=n.user_id JOIN user_profiles p ON p.user_id=n.user_id
 LEFT JOIN email_deliveries d ON d.notification_id=n.id
 WHERE a.enabled_at IS NOT NULL AND n.created_at>=a.enabled_at AND n.created_at>=a.verified_at AND n.created_at>?1-86400000
 AND n.read_at IS NULL AND json_extract(p.notification_preferences,'$.email')=1
 AND (${notificationAudienceCondition} OR (n.kind='newsletter' AND json_extract(p.notification_preferences,'$.newsletter')=1 AND n.message=${newsletterEventTitlesSql}))`;
export const eligibleEmailSql = emailAudienceSql + ` AND d.delivered_at IS NULL AND COALESCE(d.attempts,0)<5
 AND COALESCE(d.lease_until,0)<=?1 AND COALESCE(d.next_attempt_at,0)<=?1`;
export const claimEmailSql = `INSERT INTO email_deliveries(notification_id,recipient,verified_at,attempts,lease_until)
 VALUES(?1,?2,?3,1,?4+60000) ON CONFLICT(notification_id) DO UPDATE SET attempts=attempts+1,lease_until=?4+60000
 WHERE delivered_at IS NULL AND attempts<5 AND lease_until<=?4 AND next_attempt_at<=?4 AND recipient=?2 AND verified_at=?3 RETURNING attempts`;
export async function generateNewsletter() {
  const now=Date.now();
  await database().prepare(newsletterSql).bind(now,copy.newsletterSubject,String(Math.floor(now/604800000))).run();
}
export async function deliverEmailNotifications() {
  const configuration=emailConfiguration(config());
  if (!configuration) return {configured:false,delivered:0,failed:0};
  const db=database();
  const {results}=await db.prepare(eligibleEmailSql+" ORDER BY n.created_at LIMIT 4").bind(Date.now()).all<{
    id:string;user_id:string;title:string;message:string;href:string;email:string;verified_at:number;
  }>();
  let delivered=0,failed=0;
  // Sequential sends bound concurrency; provider throttling is retried with backoff.
  for (const item of results) {
    const lease=await db.prepare(claimEmailSql).bind(item.id,item.email,item.verified_at,Date.now()).first<{attempts:number}>();
    if (!lease) continue;
    const current=await db.prepare(emailAudienceSql+" AND n.id=?2 AND a.email=?3 AND a.verified_at=?4").bind(Date.now(),item.id,item.email,item.verified_at).first();
    if (!current) continue;
    const token=emailUnsubscribeToken(configuration.tokenSecret,item.user_id,item.email,item.verified_at);
    const unsubscribeUrl=new URL(`/api/email/unsubscribe?user=${encodeURIComponent(item.user_id)}&token=${token}`,configuration.origin).href;
    const destination=new URL(item.href,configuration.origin);
    if (destination.origin!==configuration.origin) continue;
    let providerId:string|null=null;
    try {
      providerId=await sendEmail(configuration,{to:item.email,subject:item.title.replace(/[\r\n]/g," "),text:`${item.title}\n\n${item.message}\n\n${destination.href}\n\n${copy.unsubscribeEmail}:\n${unsubscribeUrl}`,unsubscribeUrl},`notification:${item.id}`);
    } catch { /* No recipient addresses, provider responses or message content in logs. */ }
    await db.prepare("UPDATE email_deliveries SET delivered_at=?,provider_id=?,lease_until=0,next_attempt_at=? WHERE notification_id=?")
      .bind(providerId?Date.now():null,providerId,Date.now()+Math.min(3600000,60000*2**lease.attempts),item.id).run();
    if (providerId) delivered++; else failed++;
  }
  return {configured:true,delivered,failed};
}
