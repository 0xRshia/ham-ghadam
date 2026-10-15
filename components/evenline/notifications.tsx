"use client";

import { useRef, useState } from "react";
import { Bell, CalendarDays, CheckCheck, Clock, Heart, Layers, Ticket, Users } from "lucide-react";
import { AppLink, useAppNavigate } from "@/components/event/app-navigation";
import { useResource } from "@/hooks/use-resource";
import { api } from "@/lib/client";
import type { NotificationItem } from "@/lib/community-types";
import { notificationDestination, notificationGroup, type NotificationGroup } from "@/lib/notification-presentation";
import { date, clock, fa } from "@/lib/types";
import { copy } from "@/locales/fa";
import { ErrorState, LoadingState } from "./primitives";

const groups = [
  { id: "all", label: copy.allResults },
  { id: "organizer", label: copy.organizers },
  { id: "tickets", label: copy.tickets },
  { id: "collection", label: copy.collections },
  { id: "favorite", label: copy.favorites },
  { id: "events", label: copy.events },
  { id: "other", label: copy.other },
] as const;
const icons = { organizer: Users, tickets: Ticket, collection: Layers, favorite: Heart, events: CalendarDays, other: Bell };

export function NotificationsContent() {
  const resource = useResource<{ notifications: NotificationItem[] }>("/api/notifications");
  const [group, setGroup] = useState<NotificationGroup>("all");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const navigate = useAppNavigate();
  const notifications = resource.data?.notifications ?? [];
  const isUnread = (item: NotificationItem) => item.read_at === null && !readIds.has(item.id);
  const unread = notifications.filter(isUnread).length;
  const visible = notifications.filter(item => group === "all" || notificationGroup(item.kind) === group);

  async function read(item?: NotificationItem) {
    if (pending.current) return false;
    if (item && !isUnread(item)) return true;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/api/notifications", item ? { id: item.id } : { all: true }, "PATCH");
      setReadIds(current => new Set([...current, ...(item ? [item.id] : notifications.map(value => value.id))]));
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function open(item: NotificationItem, destination: string | null) {
    if (await read(item) && destination) navigate(destination);
  }

  if (resource.loading) return <LoadingState />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  return <>
    <div className="el-notification-actions"><button type="button" className="el-icon-button" aria-label={copy.markAllRead} title={copy.markAllRead} disabled={busy || !unread} onClick={() => void read()}><CheckCheck size={24} aria-hidden="true" /></button></div>
    <div className="el-notification-summary" role="status">{unread ? copy.unreadNotifications + " " + fa(unread) : copy.allNotificationsRead}</div>
    <div className="el-filter-chips el-notification-filters" role="group" aria-label={copy.notificationCategories}>
      {groups.filter(option => option.id !== "other" || notifications.some(item => notificationGroup(item.kind) === "other")).map(option => <button key={option.id} type="button" aria-pressed={group === option.id} onClick={() => setGroup(option.id)}>{option.label}<span>{fa(option.id === "all" ? notifications.length : notifications.filter(item => notificationGroup(item.kind) === option.id).length)}</span></button>)}
    </div>
    {error && <ErrorState message={error} />}
    <div className="el-notification-list" aria-busy={busy}>
      {!visible.length ? <div className="el-notification-empty"><Bell size={36} aria-hidden="true" /><p>{notifications.length ? copy.noCategoryNotifications : copy.noNotifications}</p></div> : visible.map(item => {
        const kind = notificationGroup(item.kind);
        const Icon = item.kind === "reminder" ? Clock : icons[kind];
        const destination = notificationDestination(item);
        const contents = <><span className="el-notification-icon"><Icon size={24} aria-hidden="true" /></span><div><span className="el-notification-kind">{groups.find(option => option.id === kind)?.label}</span><strong>{item.title}</strong><p>{item.message}</p><time dateTime={new Date(item.created_at).toISOString()}><Clock size={14} aria-hidden="true" />{date(item.created_at)} · {clock(item.created_at)}</time></div>{isUnread(item) && <span className="el-notification-unread-dot" aria-label={copy.unreadNotification} />}</>;
        const className = `el-notification-row${isUnread(item) ? " unread" : ""}`;
        return destination ? <AppLink key={item.id} href={destination} className={className} aria-disabled={busy} onNavigate={event => { event.preventDefault(); void open(item, destination); }}>{contents}</AppLink> : <button key={item.id} type="button" className={className} disabled={busy} onClick={() => void open(item, null)} aria-label={item.title + "؛ " + copy.markNotificationRead}>{contents}</button>;
      })}
    </div>
  </>;
}
