import type { NotificationPreferences } from "./community-types";
export const defaultNotificationPreferences: NotificationPreferences = { events:true,reminders:true,following:true,favorites:false,collections:false,email:false,newsletter:false };
export function notificationPreferences(value: unknown): NotificationPreferences {
  const saved = value && typeof value === "object" ? value as Record<string,unknown> : {};
  return Object.fromEntries(Object.entries(defaultNotificationPreferences).map(([key,fallback]) => [key,typeof saved[key] === "boolean" ? saved[key] : fallback])) as NotificationPreferences;
}
