// All generation uses the same timestamp so a repeated job is stable and idempotent.
// Existing reservations and follows are the authority; no sample events generate alerts.
const insert = `INSERT INTO notifications(id,user_id,kind,title,message,href,deduplication_key,created_at)`;
export const reminderNotificationsSql = `${insert}
 SELECT 'reminder:'||r.id,r.user_id,'reminder',?2,e.title,'/reservations/'||r.id,'reminder:'||r.id,?1
 FROM reservations r JOIN events e ON e.id=r.event_id LEFT JOIN user_profiles p ON p.user_id=r.user_id
 WHERE r.status='confirmed' AND e.sample=0 AND e.starts_at>?1 AND e.starts_at<=?1+86400000
 AND COALESCE(json_extract(p.notification_preferences,'$.reminders'),1)=1
 AND NOT EXISTS(SELECT 1 FROM notifications WHERE user_id=r.user_id AND deduplication_key='reminder:'||r.id)
 ORDER BY e.starts_at LIMIT 100 ON CONFLICT(user_id,deduplication_key) DO NOTHING`;
export const organizerNotificationsSql = `${insert}
 SELECT 'organizer:'||f.user_id||':'||e.id,f.user_id,'organizer',?2,e.title,'/events/'||e.id,'organizer:'||e.id,?1
 FROM organizer_follows f JOIN events e ON e.host_id=f.organizer_id LEFT JOIN user_profiles p ON p.user_id=f.user_id
 WHERE e.sample=0 AND e.published=1 AND e.ends_at>?1 AND e.created_at>=f.created_at AND e.created_at>?1-604800000
 AND COALESCE(json_extract(p.notification_preferences,'$.following'),1)=1
 AND NOT EXISTS(SELECT 1 FROM notifications WHERE user_id=f.user_id AND deduplication_key='organizer:'||e.id)
 ORDER BY e.created_at LIMIT 100 ON CONFLICT(user_id,deduplication_key) DO NOTHING`;
export const collectionNotificationsSql = `${insert}
 SELECT 'collection:'||f.user_id||':'||c.id||':'||e.id,f.user_id,'collection',?2,e.title,'/collections/'||c.id,'collection:'||c.id||':'||e.id,?1
 FROM collection_follows f JOIN collections c ON c.id=f.collection_id JOIN collection_events ce ON ce.collection_id=c.id
 JOIN events e ON e.id=ce.event_id LEFT JOIN user_profiles p ON p.user_id=f.user_id
 WHERE c.published=1 AND e.sample=0 AND e.published=1 AND e.ends_at>?1 AND ce.added_at>=f.created_at AND ce.added_at>?1-604800000
 AND COALESCE(json_extract(p.notification_preferences,'$.collections'),0)=1
 AND NOT EXISTS(SELECT 1 FROM notifications WHERE user_id=f.user_id AND deduplication_key='collection:'||c.id||':'||e.id)
 ORDER BY ce.added_at LIMIT 100 ON CONFLICT(user_id,deduplication_key) DO NOTHING`;

export const favoriteNotificationsSql = `${insert}
 SELECT 'favorite:'||f.user_id||':'||e.id,f.user_id,'favorite',?2,e.title,'/events/'||e.id,'favorite:'||e.id,?1
 FROM event_favorites f JOIN events e ON e.id=f.event_id LEFT JOIN user_profiles p ON p.user_id=f.user_id
 WHERE e.sample=0 AND e.published=1 AND e.starts_at>?1 AND e.starts_at<=?1+86400000
 AND COALESCE(json_extract(p.notification_preferences,'$.favorites'),0)=1
 AND NOT EXISTS(SELECT 1 FROM notifications WHERE user_id=f.user_id AND deduplication_key='favorite:'||e.id)
 ORDER BY e.starts_at LIMIT 100 ON CONFLICT(user_id,deduplication_key) DO NOTHING`;

export const notificationAudienceCondition = `((n.kind='booking' AND COALESCE(json_extract(p.notification_preferences,'$.events'),1)=1
   AND EXISTS(SELECT 1 FROM reservations r WHERE n.deduplication_key='booking:'||r.id AND r.user_id=n.user_id AND r.status='confirmed'))
 OR (n.kind='reminder' AND COALESCE(json_extract(p.notification_preferences,'$.reminders'),1)=1
   AND EXISTS(SELECT 1 FROM reservations r JOIN events e ON e.id=r.event_id WHERE n.deduplication_key='reminder:'||r.id AND r.user_id=n.user_id AND r.status='confirmed' AND e.starts_at>?1))
 OR (n.kind='organizer' AND COALESCE(json_extract(p.notification_preferences,'$.following'),1)=1
   AND EXISTS(SELECT 1 FROM organizer_follows f JOIN events e ON e.host_id=f.organizer_id WHERE f.user_id=n.user_id AND n.deduplication_key='organizer:'||e.id AND e.published=1 AND e.ends_at>?1))
 OR (n.kind='favorite' AND COALESCE(json_extract(p.notification_preferences,'$.favorites'),0)=1
   AND EXISTS(SELECT 1 FROM event_favorites f JOIN events e ON e.id=f.event_id WHERE f.user_id=n.user_id AND n.deduplication_key='favorite:'||e.id AND e.published=1 AND e.starts_at>?1))
 OR (n.kind='collection' AND COALESCE(json_extract(p.notification_preferences,'$.collections'),0)=1
   AND EXISTS(SELECT 1 FROM collection_follows f JOIN collections c ON c.id=f.collection_id JOIN collection_events ce ON ce.collection_id=c.id JOIN events e ON e.id=ce.event_id
    WHERE f.user_id=n.user_id AND n.deduplication_key='collection:'||c.id||':'||e.id AND c.published=1 AND e.published=1 AND e.ends_at>?1)))`;

export const pushAudienceSql = `SELECT n.id,n.title,n.message,n.href,s.id subscription_id,s.endpoint,s.p256dh,s.auth
 FROM notifications n JOIN push_subscriptions s ON s.user_id=n.user_id
 JOIN sessions session ON session.hash=s.session_hash AND session.user_id=s.user_id AND session.expires_at>?1
 LEFT JOIN user_profiles p ON p.user_id=n.user_id
 LEFT JOIN push_deliveries d ON d.notification_id=n.id AND d.subscription_id=s.id
 WHERE n.created_at>=s.created_at AND n.created_at>?1-86400000 AND n.read_at IS NULL

 AND ${notificationAudienceCondition}`;
export const eligiblePushSql = pushAudienceSql + ` AND COALESCE(d.attempts,0)<5 AND d.delivered_at IS NULL
 AND COALESCE(d.lease_until,0)<=?1 AND COALESCE(d.next_attempt_at,0)<=?1`;
export const claimPushSql = `INSERT INTO push_deliveries(notification_id,subscription_id,attempts,lease_until)
 VALUES(?1,?2,1,?3+60000) ON CONFLICT(notification_id,subscription_id) DO UPDATE
 SET attempts=attempts+1,lease_until=?3+60000 WHERE delivered_at IS NULL AND attempts<5 AND lease_until<=?3 AND next_attempt_at<=?3 RETURNING attempts`;
