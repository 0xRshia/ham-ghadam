"use client";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { useState } from "react";
import { CalendarPlus, Heart, Share2 } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { useResource } from "@/hooks/use-resource";
import { eventLocationUrl } from "@/lib/location-url";
import { normalizeInstagramProfile } from "@/lib/instagram-profile";
import { normalizeEventTeaser } from "@/lib/event-teaser";
import { eventTeaserCopy } from "@/locales/event-teaser-fa";
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
import { eventDetailDateLabel, exactEventWindow, scheduleTimeLabel } from "@/lib/event-schedule";
import dynamic from "next/dynamic";
import { DeferredLoading } from "@/components/ui/deferred-loading";
const EventShare = dynamic(() => import("./event-share").then(module => module.EventShare), { loading: DeferredLoading });
import { RegistrationCountdown } from "@/components/event/registration-countdown";

function calendarFile(event: EventDetailData) {
  if (!exactEventWindow(event)) return;
  const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const stamp = (time: number) => new Date(time).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const value = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Hmghadam//Events//FA", "BEGIN:VEVENT", `UID:${event.id}@hmghadam.com`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(event.starts_at)}`, `DTEND:${stamp(event.ends_at)}`, `SUMMARY:${escape(event.title)}`, `LOCATION:${escape(`${event.venue}، ${event.address}`)}`, `DESCRIPTION:${escape(event.description)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([value], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "hmghadam.ics"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function EventDetail({ id,configuration,initialEvent }: { id: string; configuration: MapConfiguration; initialEvent?: EventDetailData }) {
  const { data, error, loading, reload } = useResource<{ event: EventDetailData }>(`/api/events/${encodeURIComponent(id)}`, initialEvent ? { event: initialEvent } : undefined);
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
  const teaser = normalizeEventTeaser(event.teaser ?? event.teaser_url);
  return <main className="el-detail">
    <Header actions={<><button className="el-icon-button" aria-label={copy.share} onClick={() => setSharing(true)}><Share2 size={24} aria-hidden="true" /></button><button className="el-icon-button el-favorite-button" aria-label={saved ? copy.saved : copy.save} aria-pressed={saved} disabled={favoriteLoading} data-celebrating={celebrating && saved ? "true" : undefined} onClick={() => { setCelebrating(!saved); void toggle(id); }}><span className="el-heart-motion" onAnimationEnd={() => setCelebrating(false)}><Heart size={24} fill={saved ? "currentColor" : "none"} aria-hidden="true" /></span>{celebrating && saved && <span className="el-heart-burst" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <i key={index} />)}</span>}</button></>} />
    <div className="el-detail-content">
      <div className="el-detail-hero">
        {event.image && <ResponsiveImage src={event.image} alt={event.title} priority sizes="(max-width: 375px) calc(100vw - 48px), 327px" />}
        <div className="el-detail-controls">
          {teaser && <a className="el-event-teaser" href={teaser} target="_blank" rel="noopener noreferrer" title={eventTeaserCopy.action}><FigmaIcon screen={45} name="camera" size={20} /><span>{eventTeaserCopy.heroAction}</span></a>}
          {!event.schedule && event.registration_ends_at !== null && <RegistrationCountdown deadline={event.registration_ends_at} serverNow={event.serverNow} tiles squareTiles className="el-detail-countdown" />}
        </div>
        {event.program?.video_url && <button className="el-detail-video" aria-label={copy.playVideo} onClick={()=>setPlayingVideo(true)}><FigmaIcon screen={20} name="video"/><span>{copy.playVideo}</span></button>}
      </div>
      <h1>{event.title}</h1>
      <div className="el-event-calendar"><DateBadge value={event.starts_at} endsAt={event.ends_at} schedule={event.schedule} /><div><strong>{eventDetailDateLabel(event)}</strong><p style={{ whiteSpace: "pre-line" }}>{event.schedule ? scheduleTimeLabel(event) : <>{clock(event.starts_at)} {copy.until} {clock(event.ends_at)}</>}</p></div>{exactEventWindow(event) && <button className="el-calendar-button" aria-label={copy.calendar} onClick={() => calendarFile(event)}><CalendarPlus size={24} aria-hidden="true" /></button>}</div>
      <EventDescription key={event.id} text={event.description} />
      {(event.organizer || event.organizer_name) && <section className="el-detail-section el-detail-organizer"><h2>برگزارکننده</h2>{event.organizer ? <OrganizerRow organizer={event.organizer} /> : <p>{event.organizer_name}</p>}</section>}
      {instagram && <a className="el-event-instagram" href={instagram} target="_blank" rel="noopener noreferrer"><SourceIcon asset={{ src: "/icons/instagram.svg", width: 16, height: 16 }} size={16} /><span>{copy.instagramProfile}</span><bdi dir="ltr">@{new URL(instagram).pathname.split("/")[1]}</bdi></a>}
      <EventAgenda items={event.program?.agenda??[]}/>
      <section className="el-detail-section el-detail-location">
        <div className="el-venue-heading"><h2>{copy.venue}</h2>{location && <a className="el-venue-directions" href={location} target="_blank" rel="noopener noreferrer" aria-label={`مسیریابی به ${event.venue}`} title={copy.viewLocation}><FigmaIcon screen={21} name="send-2" size={22} /></a>}</div>
        <div className="el-venue-address"><p>{event.venue}{event.city && `، ${event.city}`}</p>{event.address && <p className="el-muted">{event.address}</p>}</div>
        {location && event.lat !== null && event.lng !== null && <><div className="el-venue-map"><MapPreview lat={event.lat} lng={event.lng} configuration={configuration} /></div><MapAttribution configuration={configuration} /></>}
        {location && <a className="el-button el-button-secondary el-venue-link" href={location} target="_blank" rel="noopener noreferrer">{copy.viewLocation}</a>}
      </section>
      {!!event.gallery.length && <div className="el-gallery">{event.gallery.map(item => <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer"><ResponsiveImage sizes="156px" src={item.url} alt={event.title} loading="lazy" /></a>)}</div>}
      {event.sample === 1 && <p className="el-muted">{copy.sample}</p>}
      {(event.editions?.length ?? 0) > 1 && <nav className="el-date-selector el-edition-selector" aria-label={copy.checkoutDate}>{event.editions!.map(edition => <AppLink key={edition.id} href={`/events/${encodeURIComponent(edition.id)}`} aria-current={edition.id === event.id ? "date" : undefined} aria-label={`${date(edition.starts_at, true)}، ${clock(edition.starts_at)}، ${edition.title}`}><DateBadge value={edition.starts_at} endsAt={edition.ends_at} /></AppLink>)}</nav>}
      {favoriteError && <ErrorState message={favoriteError} />}
    </div>
    {playingVideo && event.program?.video_url && <EventVideo url={event.program.video_url} poster={event.image} title={event.title} onClose={()=>setPlayingVideo(false)}/>}
    {sharing && <EventShare event={event} onClose={() => setSharing(false)} />}
  </main>;
}
