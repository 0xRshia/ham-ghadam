import { config, database } from "@/db";
import { ApiError, body, boundary, hash, json, rateLimit, requestSessionHash, requireUser, sameOrigin } from "@/lib/server";
import { allowedPushEndpoint, parseBrowserSubscription, pushConfiguration } from "@/lib/push-protocol";
import { copy } from "@/locales/fa";
export const GET = (req: Request) => boundary(async () => {
  const user = await requireUser(req), configuration = pushConfiguration(config());
  const fingerprint = new URL(req.url).searchParams.get("fingerprint");
  const { results } = await database().prepare("SELECT endpoint FROM push_subscriptions WHERE user_id=? AND session_hash=?")
    .bind(user.id,await requestSessionHash(req)).all<{ endpoint:string }>();
  const subscribed = !!fingerprint && (await Promise.all(results.map(row => hash(row.endpoint)))).includes(fingerprint);
  return json({ configured:!!configuration,publicKey:configuration?.publicKey ?? null,subscribed });
});
export const POST = (req: Request) => boundary(async () => {
  sameOrigin(req);
  const user = await requireUser(req);
  await rateLimit(`push-subscribe:${user.id}`,30);
  const subscription = parseBrowserSubscription(await body(req,5000));
  if (!subscription) throw new ApiError(400,copy.pushInvalid);
  if (!pushConfiguration(config())) throw new ApiError(503,copy.pushUnconfigured);
  await database().prepare("DELETE FROM push_subscriptions WHERE user_id=? AND (session_hash IS NULL OR NOT EXISTS(SELECT 1 FROM sessions WHERE hash=session_hash AND expires_at>?))").bind(user.id,Date.now()).run();
  const saved = await database().prepare(`INSERT INTO push_subscriptions(id,user_id,session_hash,endpoint,p256dh,auth,created_at)
    SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE EXISTS(SELECT 1 FROM sessions WHERE hash=?3 AND user_id=?2 AND expires_at>?7)
    AND ((SELECT COUNT(*) FROM push_subscriptions WHERE user_id=?2 AND endpoint<>?4)<5)
    ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,session_hash=excluded.session_hash,
      p256dh=excluded.p256dh,auth=excluded.auth,created_at=CASE WHEN push_subscriptions.user_id=excluded.user_id AND push_subscriptions.session_hash=excluded.session_hash THEN push_subscriptions.created_at ELSE excluded.created_at END
    RETURNING id`).bind(crypto.randomUUID(),user.id,await requestSessionHash(req),subscription.endpoint,subscription.keys.p256dh,subscription.keys.auth,Date.now()).first();
  if (!saved) throw new ApiError(409,copy.pushDeviceLimit);
  return json({ ok:true });
});
export const DELETE = (req: Request) => boundary(async () => {
  sameOrigin(req); const user = await requireUser(req), data = await body(req,3000);
  if (!allowedPushEndpoint(data.endpoint)) throw new ApiError(400,copy.pushInvalid);
  await database().prepare("DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?").bind(user.id,data.endpoint).run();
  return json({ ok:true });
});
