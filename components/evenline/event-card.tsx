"use client";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { useId, useState } from "react";
import { AppLink } from "@/components/event/app-navigation";
import { type EventItem, fa } from "@/lib/types";
import { copy } from "@/locales/fa";
import { CalendarDays, ImageIcon, MapPin } from "lucide-react";
import { DISCOVERY_ONLY } from "@/lib/product-mode";
import { scheduleDateLabel, scheduleTimeLabel, tehranDay, type FlexibleSchedule } from "@/lib/event-schedule";

export function Price({ value }: { value: number }) {
  if (DISCOVERY_ONLY) return null;
  return <>{value === 0 ? copy.free : <>{fa(value)} <small>{copy.toman}</small></>}</>;
}
const badgeDay = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", day: "numeric" });
const badgeMonth = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", month: "long" });
export function DateBadge({ value, endsAt, schedule }: { value: number | null; endsAt?: number | null; schedule?: FlexibleSchedule | null }) {
  if (value === null && !schedule) return null;
  const day = (time: number) => badgeDay.format(time);
  const month = (time: number) => badgeMonth.format(time);
  const knownDates = schedule?.dates ?? [];
  const first = schedule ? knownDates[0] ?? schedule.range_start ?? schedule.range_end : value;
  const last = schedule ? knownDates.at(-1) ?? schedule.range_end
    : value !== null && endsAt != null && tehranDay(value) !== tehranDay(endsAt) ? endsAt : value;
  const label = scheduleDateLabel({ starts_at: value, ends_at: endsAt ?? null, schedule }, true);
  let days = first == null ? "" : day(first);
  let months = first == null ? schedule?.weekdays.length ? "هفتگی" : "زمان‌بندی" : month(first);
  if (first != null) {
    if (schedule && !knownDates.length && schedule.range_start === null && schedule.range_end !== null) days = `تا ${days}`;
    else if (last != null && last !== first) {
      days = `${days}${knownDates.length ? "،" : "–"}${day(last)}`;
      if (month(first) !== month(last)) months = `${month(first)}–${month(last)}`;
    }
  }
  const className = `el-date-badge${days.length > 2 || months.length > 9 ? " el-date-badge-wide" : ""}`;
  const content = <>{days ? <strong>{days}</strong> : <CalendarDays size={16} aria-hidden="true" />}<span>{months}</span></>;
  return first != null && (!schedule || knownDates.length === 1) ? <time className={className} dateTime={new Date(first).toISOString()} aria-label={label} title={label}>{content}</time> : <span className={className} aria-label={label} title={label}>{content}</span>;
}
export function EventCard({ event, variant = "card", action = "join", priority = false }: { event: EventItem; variant?: "card" | "list" | "feature"; action?: "join" | "price"; priority?: boolean }) {
  const href = `/events/${encodeURIComponent(event.id)}`;
  const image = variant === "feature" ? event.image || event.thumbnail : event.thumbnail || event.image;
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const scheduleId = useId();
  const timeLabel = scheduleTimeLabel(event);
  return <article className={`el-event-${variant}${event.schedule ? " el-event-scheduled" : ""}`}>
    <AppLink className="el-event-image" href={href} tabIndex={-1} aria-hidden="true">
      {image && image !== failedImage ? <ResponsiveImage src={image} alt="" priority={priority} sizes={variant === "list" ? "88px" : variant === "feature" ? "250px" : "238px"} onError={() => setFailedImage(image)} /> : <span className="el-event-placeholder" aria-hidden="true"><ImageIcon size={32}/></span>}
      {variant === "list" && <DateBadge value={event.starts_at} endsAt={event.ends_at} schedule={event.schedule} />}
    </AppLink>
    {variant === "feature" && <DateBadge value={event.starts_at} endsAt={event.ends_at} schedule={event.schedule} />}
    <div className="el-event-copy">
      {(variant === "card" || event.schedule) && <div className={`el-event-time${event.schedule ? " el-flexible-schedule" : ""}`}><span>{scheduleDateLabel(event)}</span>{timeLabel && <><span aria-hidden="true"> · </span><span>{timeLabel}</span></>}</div>}
      <h3><AppLink href={href} aria-describedby={scheduleId}>{event.title}</AppLink></h3>
      <span className="el-sr-only" id={scheduleId}>{scheduleDateLabel(event, true)}{timeLabel ? `، ${timeLabel}` : ""}</span>
      {variant === "list" && event.distance !== undefined && <p className="el-event-distance">{copy.approximateDistance} {fa(Math.round(event.distance * 10) / 10)} {copy.kilometers}</p>}
      <div className="el-event-bottom"><span className="el-location">{variant !== "feature" && <MapPin size={16} fill="none" aria-hidden="true" />}<span>{event.city}</span>{variant !== "card" && !event.schedule && timeLabel && <><i className="el-meta-dot" aria-hidden="true"/><span className="el-card-hours" title={timeLabel}>{timeLabel}</span></>}</span>
        {variant === "list" && (DISCOVERY_ONLY || action === "join") ? <AppLink className="el-button el-button-primary el-button-small" href={href}>{DISCOVERY_ONLY ? "جزئیات رویداد" : copy.join}</AppLink> : !DISCOVERY_ONLY && <span className="el-price"><Price value={event.minimum_price ?? event.price} /></span>}
      </div>
    </div>
  </article>;
}
