"use client";
import { useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { useResource } from "@/hooks/use-resource";
import { useDeadlineClock } from "@/hooks/use-deadline-clock";
import { registrationState } from "@/lib/registration";
import { eventLocationUrl } from "@/lib/location-url";
import { type EventDetailData, date, clock, fa } from "@/lib/types";
import { copy } from "@/locales/fa";
import { Header, Button, ErrorState, LoadingState, SourceIcon, useFavorites } from "./primitives";
import { DateBadge, Price } from "./event-card";
import { FigmaIcon } from "./source-icon";
import { OrganizerRow } from "./community";
import { EventAgenda, EventVideo } from "./event-program";
import type { MapConfiguration } from "@/lib/map-configuration";
import { MapPreview, MapAttribution } from "./map-preview";
import { assets } from "./assets";

function calendarFile(event: EventDetailData) {
  const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const stamp = (time: number) => new Date(time).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const value = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Hmghadam//Events//FA", "BEGIN:VEVENT", `UID:${event.id}@hmghadam.com`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(event.starts_at)}`, `DTEND:${stamp(event.ends_at)}`, `SUMMARY:${escape(event.title)}`, `LOCATION:${escape(`${event.venue}، ${event.address}`)}`, `DESCRIPTION:${escape(event.description)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([value], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "hmghadam.ics"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function EventDetail({ id,configuration }: { id: string; configuration: MapConfiguration }) {
  const { data, error, loading, reload } = useResource<{ event: EventDetailData }>(`/api/events/${encodeURIComponent(id)}`);
  const event = data?.event;
  const now = useDeadlineClock(event ? Math.min(event.registration_ends_at, event.starts_at) : undefined, 60000, event?.serverNow);
  const [expanded, setExpanded] = useState(false);
  const [playingVideo, setPlayingVideo] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUrl,setShareUrl] = useState("");
  const [message, setMessage] = useState("");
  const { ids, toggle, error: favoriteError } = useFavorites();
  const saved = ids.includes(id);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (sharing) dialog.current?.showModal(); else dialog.current?.close(); }, [sharing]);
  if (loading) return <main><Header /><LoadingState /></main>;
  if (error || !event) return <main><Header /><ErrorState message={error || copy.notFound} retry={reload} /></main>;
  const availability = now === null ? "checking" : registrationState(event, now);
  const location = eventLocationUrl(event);
  const prices = event.ticketTiers?.length ? event.ticketTiers.map(tier => tier.price) : [event.price];
  async function share(copyOnly = false) {
    if (!event) return false;
    try {
      if (!copyOnly && navigator.share) await navigator.share({ title: event.title, url: shareUrl });
      else { await navigator.clipboard.writeText(shareUrl); setMessage(copy.copied); }
      return true;
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setMessage(copy.shareError); return false; }
  }
  return <main className="el-detail el-bottom-space">
    <Header actions={<><button className="el-icon-button" aria-label={copy.share} onClick={() => {setShareUrl(new URL(`/events/${encodeURIComponent(id)}`,window.location.origin).href);setMessage("");setSharing(true);}}><FigmaIcon name="share" /></button><button className="el-icon-button el-favorite-button" aria-label={saved ? copy.saved : copy.save} aria-pressed={saved} onClick={() => void toggle(id)}><Heart size={24} fill={saved ? "currentColor" : "none"} aria-hidden="true" /></button></>} />
    <div className="el-detail-content">
      <div className="el-detail-hero">{event.image && <img src={event.image} alt={event.title} />}{event.program?.video_url && <button className="el-detail-video" aria-label={copy.playVideo} onClick={()=>setPlayingVideo(true)}><FigmaIcon screen={20} name="video"/><span>{copy.playVideo}</span></button>}</div>
      <h1>{event.title}</h1>
      <div className="el-event-calendar"><DateBadge value={event.starts_at} /><div><strong>{date(event.starts_at)}</strong><p>{clock(event.starts_at)} {copy.until} {clock(event.ends_at)}</p></div><button className="el-calendar-button" aria-label={copy.calendar} onClick={() => calendarFile(event)}><SourceIcon asset={assets.detail.imgCalendarAdd} /></button></div>
      <section className="el-about-event"><h2>{copy.aboutEvent}</h2><p className={expanded ? "" : "el-clamp-five"}>{event.description}</p><button className="el-text-action" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? copy.less : copy.more}</button></section>
      {event.organizer && <OrganizerRow organizer={event.organizer} />}
      <EventAgenda items={event.program?.agenda??[]}/>
      <section className="el-detail-section el-detail-location"><h2>{copy.venue}</h2>{location&&event.lat!==null&&event.lng!==null ? <><a className="el-venue-map" href={location} target="_blank" rel="noopener noreferrer"><MapPreview lat={event.lat} lng={event.lng} configuration={configuration}/><span className="el-venue-map-label"><span className="el-venue-map-icon"><FigmaIcon screen={21} name="send-2"/></span><span><strong>{event.venue}</strong><small>{event.address}</small></span></span></a><MapAttribution configuration={configuration}/></> : <><p>{event.venue}، {event.city}</p><p className="el-muted">{event.address}</p>{location&&<a className="el-button el-button-secondary" href={location} target="_blank" rel="noopener noreferrer">{copy.viewLocation}</a>}</>}</section>
      {!!event.gallery.length && <div className="el-gallery">{event.gallery.map(item => <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer"><img src={item.url} alt={event.title} loading="lazy" /></a>)}</div>}
      {event.sample === 1 && <p className="el-muted">{copy.sample}</p>}
      {favoriteError && <ErrorState message={favoriteError} />}{message && <p role="status">{message}</p>}
    </div>
    <footer className="el-action-footer el-purchase-footer"><div><strong><Price value={Math.min(...prices)} />{Math.max(...prices) !== Math.min(...prices) && <> – <Price value={Math.max(...prices)} /></>}</strong><p>{event.remaining === null ? copy.unlimited : `${fa(event.remaining)} ${copy.spotsLeft}`}</p></div>{availability === "open" ? <AppLink className="el-button el-button-primary" href={`/events/${encodeURIComponent(id)}/tickets`}>{copy.getTicket}</AppLink> : <Button disabled>{availability === "sold_out" ? copy.soldOut : copy.closed}</Button>}</footer>
    {playingVideo && event.program?.video_url && <EventVideo url={event.program.video_url} poster={event.image} title={event.title} onClose={()=>setPlayingVideo(false)}/>}
    <dialog ref={dialog} className="el-sheet el-share-sheet" aria-labelledby="share-title" onCancel={() => setSharing(false)} onClose={() => setSharing(false)}>
      <div className="el-sheet-handle" /><header><h2 id="share-title">{copy.shareEvent}</h2><button className="el-icon-button" aria-label={copy.close} onClick={() => setSharing(false)}><FigmaIcon screen={23} name="x" /></button></header>
      <div className="el-share-event">{event.image && <img src={event.image} alt="" />}<div><h3>{event.title}</h3><div className="el-share-link"><bdi dir="ltr" title={shareUrl}>{shareUrl}</bdi><Button small variant="secondary" onClick={() => void share(true)}><FigmaIcon screen={23} name="link"/>{copy.copyLink}</Button></div></div></div>
      <div className="el-share-actions"><a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer"><span><SourceIcon asset={{ src: "/icons/facebook.svg", width: 24, height: 24 }}/></span>{copy.facebook}</a><button onClick={async()=>{if(typeof navigator.share === "function")await share();else if(await share(true)){setMessage(copy.storyShareHint);}}}><span><SourceIcon asset={{ src: "/icons/instagram.svg", width: 24, height: 24 }}/></span>{copy.stories}</button><a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(event.title)}`} target="_blank" rel="noopener noreferrer"><span><img src="/figma/twitter.png" width={24} height={24} alt=""/></span>{copy.twitter}</a><a href={`mailto:?subject=${encodeURIComponent(event.title)}&body=${encodeURIComponent(shareUrl)}`}><span><FigmaIcon screen={23} name="logos:google-gmail"/></span>{copy.email}</a></div>{message&&<p className="el-share-status" role="status">{message}</p>}
    </dialog>
  </main>;
}
