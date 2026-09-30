import { createHash, timingSafeEqual } from "node:crypto";
import { config, database } from "@/db";
import { boundary, json } from "@/lib/server";
import { generateNotifications, deliverPushNotifications } from "@/lib/notifications";
import { generateNewsletter, deliverEmailNotifications } from "@/lib/email-notifications";
export const POST = (req: Request) => boundary(async () => {
  const secret = config().NOTIFICATION_JOB_SECRET;
  const supplied = req.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32 || !timingSafeEqual(createHash("sha256").update(supplied).digest(),createHash("sha256").update(`Bearer ${secret}`).digest())) return json({ error:"Unauthorized" },401);
  await database().prepare("DELETE FROM email_challenges WHERE id IN (SELECT id FROM email_challenges WHERE expires_at<? LIMIT 500)").bind(Date.now()-86400000).run();
  await generateNotifications();
  await generateNewsletter();
  const push=await deliverPushNotifications();
  return json({...push,email:await deliverEmailNotifications()});
});
