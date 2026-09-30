import { faContent } from "@/locales/domain-fa";
import { config, database } from "@/db";
import { emailConfiguration } from "@/lib/email-protocol";
import { copy } from "@/locales/fa";
import { boundary, json, requireUser, body, sameOrigin, ApiError } from "@/lib/server";
import { categories } from "@/lib/types";
import { defaultNotificationPreferences, notificationPreferences } from "@/lib/notification-preferences";
import type { Profile } from "@/lib/community-types";
export const GET = (req: Request) => boundary(async () => {
  const user = await requireUser(req);
  const record = await database().prepare("SELECT bio,city,avatar_url,interests,notification_preferences,onboarding_completed FROM user_profiles WHERE user_id=?").bind(user.id).first<{ bio: string; city: string; avatar_url: string | null; interests: string; notification_preferences: string; onboarding_completed: number }>();
  const profile: Profile = record ? { ...record, interests: JSON.parse(record.interests), notification_preferences: notificationPreferences(JSON.parse(record.notification_preferences)), onboarding_completed: !!record.onboarding_completed } : { bio: "", city: "", avatar_url: null, interests: [], notification_preferences: defaultNotificationPreferences, onboarding_completed: false };
  const counts = await database().prepare("SELECT (SELECT COUNT(*) FROM organizer_follows WHERE user_id=?1) following,(SELECT COUNT(*) FROM organizer_follows WHERE organizer_id=?1) followers,(SELECT COUNT(*) FROM reservations WHERE user_id=?1 AND status='confirmed') bookings").bind(user.id).first();
  const credential = await database().prepare("SELECT user_id FROM password_credentials WHERE user_id=?").bind(user.id).first();
  return json({ profile, user, counts, security: {hasPassword:!!credential} });
});
export const PATCH = (req: Request) => boundary(async () => {
  sameOrigin(req); const user = await requireUser(req); const data = await body(req);
  const textField = (value: unknown, max: number) => {
    if (typeof value !== "string" || value.trim().length > max || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value)) throw new ApiError(400,faContent.invalidProfile);
    return value.trim();
  };
  const updates: Record<string, string | number> = {};
  if (data.bio !== undefined) updates.bio = textField(data.bio, 1000);
  if (data.city !== undefined) updates.city = textField(data.city, 80);
  if (data.interests !== undefined) {
    if (!Array.isArray(data.interests) || data.interests.length > categories.length || data.interests.some((id: unknown) => typeof id !== "string" || id === "all" || !categories.some(c => c.id === id))) throw new ApiError(400,faContent.invalidInterests);
    updates.interests = JSON.stringify([...new Set(data.interests)]);
  }
  if (data.notification_preferences !== undefined) {
    const preferences = data.notification_preferences;
    if (!preferences || ["events", "reminders", "following"].some(key => typeof preferences[key] !== "boolean")) throw new ApiError(400,faContent.invalidNotificationSettings);
    if (["favorites","collections","email","newsletter"].some(key => preferences[key] !== undefined && typeof preferences[key] !== "boolean")) throw new ApiError(400,faContent.invalidNotificationSettings);
    const existing = await database().prepare("SELECT notification_preferences FROM user_profiles WHERE user_id=?").bind(user.id).first<{ notification_preferences:string }>();
    const previous = notificationPreferences(existing ? JSON.parse(existing.notification_preferences) : {});
    const next = notificationPreferences({ ...previous,...preferences });
    if (next.newsletter && !next.email) throw new ApiError(400,copy.emailRequired);
    if (next.email && !previous.email) {
      if (!emailConfiguration(config())) throw new ApiError(503,copy.emailUnconfigured);
      if (!await database().prepare("SELECT user_id FROM account_emails WHERE user_id=?").bind(user.id).first()) throw new ApiError(400,copy.emailRequired);
    }
    updates.notification_preferences = JSON.stringify(next);
  }
  if (data.onboarding_completed !== undefined) {
    if (typeof data.onboarding_completed !== "boolean") throw new ApiError(400,faContent.invalidRequest);
    updates.onboarding_completed = Number(data.onboarding_completed);
  }
  if (!Object.keys(updates).length) throw new ApiError(400,faContent.noChanges);
  const db = database();
  await db.batch([
    db.prepare("INSERT INTO user_profiles(user_id,updated_at) VALUES(?,?) ON CONFLICT(user_id) DO NOTHING").bind(user.id, Date.now()),
    ...(updates.notification_preferences ? [db.prepare("UPDATE account_emails SET enabled_at=CASE WHEN ?=1 THEN COALESCE(enabled_at,?) ELSE NULL END WHERE user_id=?").bind(Number(JSON.parse(String(updates.notification_preferences)).email),Date.now(),user.id)] : []),
    db.prepare(`UPDATE user_profiles SET ${Object.keys(updates).map(key => `${key}=?`).join(",")},updated_at=? WHERE user_id=?`).bind(...Object.values(updates),Date.now(),user.id),
  ]);
  return json({ ok: true });
});
