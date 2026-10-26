"use client";
import { useState } from "react";
import { CalendarPlus, Heart, Share2 } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { useResource } from "@/hooks/use-resource";
import { eventLocationUrl } from "@/lib/location-url";
import { normalizeInstagramProfile } from "@/lib/instagram-profile";
import { type EventDetailData, clock, date } from "@/lib/types";
import { copy } from "@/locales/fa";
import { Header, ErrorState, LoadingState, SourceIcon, useFavorites } from "./primitives";
import { DateBadge } from "./event-card";
import { EventDescription } from "./event-description";
import { FigmaIcon } from "./source-icon";
import { OrganizerRow } from "./community";
import { EventAgenda, EventVideo } from "./event-program";
import type { MapConfiguration } from "@/lib/map-configuration";
import { MapPreview, MapAttribution } from "./map-preview";
import { exactEventWindow, scheduleDateLabel, scheduleTimeLabel } from "@/lib/event-schedule";
import { EventShare } from "./event-share";

function calendarFile(event: EventDetailData) {
  if (!exactEventWindow(event)) return;
  const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const stamp = (time: number) => new Date(time).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const value = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Hmghadam//Events//FA", "BEGIN:VEVENT", `UID:${event.id}@hmghadam.com`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(event.starts_at)}`, `DTEND:${stamp(event.ends_at)}`, `SUMMARY:${escape(event.title)}`, `LOCATION:${escape(`${event.venue}، ${event.address}`)}`, `DESCRIPTION:${escape(event.description)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([value], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "hmghadam.ics"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function EventDetail({ id,configuration }: { id: string; configuration: MapConfiguration }) {
  const { data, error, loading, reload } = useResource<{ event: EventDetailData }>(`/api/events/${encodeURIComponent(id)}`);
  const event = data?.event;
  const [playingVideo, setPlayingVideo] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const { ids, toggle, loading: favoriteLoading, error: favoriteError } = useFavorites();
  const saved = ids.includes(id);
  if (loading) return <main><Header /><LoadingState /></main>;
  if (error || !event) return <main><Header /><ErrorState message={error || copy.notFound} retry={reload} /></main>;
  const location = eventLocationUrl(event);
  const instagram = normalizeInstagramProfile(event.instagram_url);
  return <main className="el-detail">
    <Header actions={<><button className="el-icon-button" aria-label={copy.share} onClick={() => setSharing(true)}><Share2 size={24} aria-hidden="true" /></button><button className="el-icon-button el-favorite-button" aria-label={saved ? copy.saved : copy.save} aria-pressed={saved} disabled={favoriteLoading} data-celebrating={celebrating && saved ? "true" : undefined} onClick={() => { setCelebrating(!saved); void toggle(id); }}><span className="el-heart-motion" onAnimationEnd={() => setCelebrating(false)}><Heart size={24} fill={saved ? "currentColor" : "none"} aria-hidden="true" /></span>{celebrating && saved && <span className="el-heart-burst" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <i key={index} />)}</span>}</button></>} />
    <div className="el-detail-content">
      <div className="el-detail-hero">{event.image && <img src={event.image} alt={event.title} />}{event.program?.video_url && <button className="el-detail-video" aria-label={copy.playVideo} onClick={()=>setPlayingVideo(true)}><FigmaIcon screen={20} name="video"/><span>{copy.playVideo}</span></button>}</div>
      <h1>{event.title}</h1>
      <div className="el-event-calendar"><DateBadge value={event.starts_at} schedule={event.schedule} /><div><strong>{scheduleDateLabel(event, true)}</strong><p style={{ whiteSpace: "pre-line" }}>{event.schedule ? scheduleTimeLabel(event) : <>{clock(event.starts_at)} {copy.until} {clock(event.ends_at)}</>}</p></div>{exactEventWindow(event) && <button className="el-calendar-button" aria-label={copy.calendar} onClick={() => calendarFile(event)}><CalendarPlus size={24} aria-hidden="true" /></button>}</div>
      <EventDescription key={event.id} text={event.description} />
      {event.organizer ? <OrganizerRow organizer={event.organizer} /> : event.organizer_name && <section className="el-detail-section"><h2>{copy.organizers}</h2><p>{event.organizer_name}</p></section>}
      {instagram && <a className="el-event-instagram" href={instagram} target="_blank" rel="noopener noreferrer"><SourceIcon asset={{ src: "/icons/instagram.svg", width: 22, height: 22 }} /><span>{copy.instagramProfile}</span><bdi dir="ltr">@{new URL(instagram).pathname.split("/")[1]}</bdi></a>}
      <EventAgenda items={event.program?.agenda??[]}/>
      <section className="el-detail-section el-detail-location"><h2>{copy.venue}</h2>{location&&event.lat!==null&&event.lng!==null ? <><div className="el-venue-map"><MapPreview lat={event.lat} lng={event.lng} configuration={configuration}/><a className="el-venue-map-label" href={location} target="_blank" rel="noopener noreferrer"><span className="el-venue-map-icon"><FigmaIcon screen={21} name="send-2"/></span><span><strong>{event.venue}</strong><small>{event.address}</small></span></a></div><MapAttribution configuration={configuration}/></> : <><p>{event.venue}، {event.city}</p><p className="el-muted">{event.address}</p>{location&&<a className="el-button el-button-secondary" href={location} target="_blank" rel="noopener noreferrer">{copy.viewLocation}</a>}</>}</section>
      {!!event.gallery.length && <div className="el-gallery">{event.gallery.map(item => <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer"><img src={item.url} alt={event.title} loading="lazy" /></a>)}</div>}
      {event.sample === 1 && <p className="el-muted">{copy.sample}</p>}
      {(event.editions?.length ?? 0) > 1 && <nav className="el-date-selector el-edition-selector" aria-label={copy.checkoutDate}>{event.editions!.map(edition => <AppLink key={edition.id} href={`/events/${encodeURIComponent(edition.id)}`} aria-current={edition.id === event.id ? "date" : undefined} aria-label={`${date(edition.starts_at, true)}، ${clock(edition.starts_at)}، ${edition.title}`}><DateBadge value={edition.starts_at} /></AppLink>)}</nav>}
      {favoriteError && <ErrorState message={favoriteError} />}
    </div>
    {playingVideo && event.program?.video_url && <EventVideo url={event.program.video_url} poster={event.image} title={event.title} onClose={()=>setPlayingVideo(false)}/>}
    {sharing && <EventShare event={event} onClose={() => setSharing(false)} />}
  </main>;
}
