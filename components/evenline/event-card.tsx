"use client";
import { useState } from "react";
import { AppLink } from "@/components/event/app-navigation";
import { type EventItem, fa, date, clock } from "@/lib/types";
import { copy } from "@/locales/fa";
import { ImageIcon, MapPin } from "lucide-react";

export function Price({ value }: { value: number }) {
  return <>{value === 0 ? copy.free : <>{fa(value)} <small>{copy.toman}</small></>}</>;
}
export function DateBadge({ value }: { value: number }) {
  const options = { timeZone: "Asia/Tehran" };
  return <time className="el-date-badge" dateTime={new Date(value).toISOString()}>
    <strong>{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { ...options, day: "numeric" }).format(value)}</strong>
    <span>{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { ...options, month: "short" }).format(value)}</span>
  </time>;
}
export function EventCard({ event, variant = "card", action = "join", priority = false }: { event: EventItem; variant?: "card" | "list" | "feature"; action?: "join" | "price"; priority?: boolean }) {
  const href = `/events/${encodeURIComponent(event.id)}`;
  const image = variant === "feature" ? event.image || event.thumbnail : event.thumbnail || event.image;
  const [failedImage, setFailedImage] = useState<string | null>(null);
  return <article className={`el-event-${variant}`}>
    <AppLink className="el-event-image" href={href} tabIndex={-1} aria-hidden="true">
      {image && image !== failedImage ? <img src={image} alt="" loading={priority ? "eager" : "lazy"} onError={() => setFailedImage(image)} /> : <span className="el-event-placeholder" aria-hidden="true"><ImageIcon size={32}/></span>}
      {variant === "list" && <DateBadge value={event.starts_at} />}
    </AppLink>
    {variant === "feature" && <DateBadge value={event.starts_at} />}
    <div className="el-event-copy">
      {variant === "card" && <div className="el-event-time"><span>{date(event.starts_at)}</span><span aria-hidden="true">·</span><span>{clock(event.starts_at)}</span></div>}
      <h3><AppLink href={href}>{event.title}</AppLink></h3>
      {variant === "list" && event.distance !== undefined && <p className="el-event-distance">{copy.approximateDistance} {fa(Math.round(event.distance * 10) / 10)} {copy.kilometers}</p>}
      <div className="el-event-bottom"><span className="el-location">{variant !== "feature" && <MapPin size={16} fill="none" aria-hidden="true" />}<span>{event.city}</span>{variant === "feature" && <><i className="el-meta-dot" aria-hidden="true"/><time dateTime={new Date(event.starts_at).toISOString()}>{clock(event.starts_at)}</time></>}</span>
        {variant === "list" && action === "join" ? <AppLink className="el-button el-button-primary el-button-small" href={href}>{copy.join}</AppLink> : <span className="el-price"><Price value={event.minimum_price ?? event.price} /></span>}
      </div>
    </div>
  </article>;
}
