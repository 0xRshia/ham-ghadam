import { database, config } from "@/db";
import { copy } from "@/locales/fa";
import { collectionNotificationsSql, favoriteNotificationsSql, organizerNotificationsSql, reminderNotificationsSql, eligiblePushSql, pushAudienceSql, claimPushSql } from "./notification-queries";
import { encryptedPushRequest, pushConfiguration } from "./push-protocol";

export async function generateNotifications() {
  const db = database(), now = Date.now();
  await db.batch([
    db.prepare(reminderNotificationsSql).bind(now,copy.reminderNotification),
    db.prepare(organizerNotificationsSql).bind(now,copy.organizerNotification),
    db.prepare(collectionNotificationsSql).bind(now,copy.collectionNotification),
    db.prepare(favoriteNotificationsSql).bind(now,copy.favoriteNotification),
  ]);
}
export async function deliverPushNotifications() {
  const configuration = pushConfiguration(config());
  if (!configuration) return { configured: false, delivered: 0, failed: 0 };
  const db = database(), now = Date.now();
  const { results } = await db.prepare(eligiblePushSql + " ORDER BY n.created_at LIMIT 24").bind(now).all<{
    id: string; title: string; message: string; href: string; subscription_id: string; endpoint: string; p256dh: string; auth: string;
  }>();
  let delivered = 0, failed = 0;
  // Bounded concurrency keeps a job below the lease duration, including network timeouts.
  for (let index = 0; index < results.length; index += 4) {
    await Promise.all(results.slice(index,index+4).map(async item => {
      const lease = await db.prepare(claimPushSql).bind(item.id,item.subscription_id,Date.now()).first<{ attempts: number }>();
      if (!lease) return;
      // Recheck opt-outs, cancellation, and session revocation immediately before sending.
      if (!await db.prepare(pushAudienceSql + " AND n.id=?2 AND s.id=?3").bind(Date.now(),item.id,item.subscription_id).first()) return;
      let status = 0;
      try {
        const request = encryptedPushRequest({ endpoint:item.endpoint, keys:{ p256dh:item.p256dh,auth:item.auth } }, { id:item.id,title:item.title,message:item.message,href:item.href }, configuration);
        const response = await fetch(request.endpoint,request.init);
        status = response.status;
        await response.body?.cancel();
      } catch { /* Retry without logging private endpoints or notification content. */ }
      if (status === 404 || status === 410) {
        await db.prepare("DELETE FROM push_subscriptions WHERE id=? AND endpoint=?").bind(item.subscription_id,item.endpoint).run();
        failed++;
      } else {
        const success = status >= 200 && status < 300;
        await db.prepare("UPDATE push_deliveries SET delivered_at=?,status_code=?,lease_until=0,next_attempt_at=? WHERE notification_id=? AND subscription_id=?")
          .bind(success ? Date.now() : null,status,Date.now()+Math.min(3600000,60000*2**lease.attempts),item.id,item.subscription_id).run();
        if (success) delivered++; else failed++;
      }
    }));
  }
  return { configured:true,delivered,failed };
}
