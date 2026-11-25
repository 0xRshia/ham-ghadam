"use client";

import { useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { eventApp, eventCalendar, topics, type Topic } from "@/lib/landing-content";
import type { LandingEvent } from "@/lib/landing-events";
import { plainClick, PosterWall, topicHref } from "./poster-wall";

const chipOrder = ["music", "art", "books", "games", "coffee"] as const;
const persianDate = new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", day: "numeric", month: "long", year: "numeric" });
const tehranTime = new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit" });

function searchableText(value: string) {
  return value.normalize("NFKC").toLowerCase()
    .replace(/[\u064b-\u065f\u0670\u0640]/gu, "")
    .replace(/[يى]/gu, "ی").replace(/ك/gu, "ک").replace(/[أإآ]/gu, "ا")
    .replace(/[۰-۹٠-٩]/gu, digit => String("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩".indexOf(digit) % 10))
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/گفت *و *گو/gu, "گفتگو").trim();
}

function dateParts(value: number | null) {
  if (value === null) return null;
  const parts = persianDate.formatToParts(value);
  return {
    day: parts.find(part => part.type === "day")?.value,
    month: parts.find(part => part.type === "month")?.value,
    year: parts.find(part => part.type === "year")?.value,
  };
}

function eventDate(event: LandingEvent) {
  const start = dateParts(event.startsAt);
  const end = dateParts(event.endsAt);
  if (!start && !end) return null;
  if (!end) return { day: start?.day, month: start?.month };
  if (!start) return { day: `تا ${end.day}`, month: end.month };
  if (start.year === end.year && start.month === end.month && start.day === end.day) return end;
  return {
    day: `${start.day}–${end.day}`,
    month: start.month === end.month ? end.month : `${start.month}–${end.month}`,
  };
}

function eventTime(event: LandingEvent) {
  if (event.scheduleTime) return event.scheduleTime;
  if (event.startsAt === null) return "";
  const start = tehranTime.format(event.startsAt);
  return event.endsAt === null ? start : `${start} تا ${tehranTime.format(event.endsAt)}`;
}

function posterSources(poster: string) {
  const url = new URL(poster);
  if (url.origin !== eventApp || !/^\/api\/media\/[^/]+$/.test(url.pathname)) return undefined;
  // Match the event app's public image rendition widths and version.
  return [192, 384, 640].map(width => {
    url.searchParams.set("w", String(width));
    url.searchParams.set("v", "1");
    return `${url.href} ${width}w`;
  }).join(", ");
}

function EventCards({ events, compact = false }: { events: LandingEvent[]; compact?: boolean }) {
  return <div className={compact ? "event-list" : "event-carousel"} aria-label="پوستر رویدادها" role="group">
    {events.map(event => {
      const date = eventDate(event);
      const time = eventTime(event);
      return <a key={event.id} href={`${eventApp}/events/${encodeURIComponent(event.id)}`}
        className={event.poster ? "event-card" : "event-card without-poster"}>
        <span className="event-print">
          {event.poster && <img className="poster" src={event.poster} srcSet={posterSources(event.poster)}
            sizes={compact ? "88px" : "(max-width: 347px) 72vw, 250px"}
            width={384} height={683} loading="lazy" decoding="async" alt=""
            onError={event => { event.currentTarget.removeAttribute("srcset"); }} />}
          {date && <span className="date-badge">
            {event.scheduleDate && <span className="sr-only">{event.scheduleDate}</span>}
            <strong aria-hidden={Boolean(event.scheduleDate)}>{date.day}</strong>
            <span aria-hidden={Boolean(event.scheduleDate)}>{date.month}</span>
          </span>}
        </span>
        <div className="event-details">
          <h3>{event.title}</h3>
          <div className="event-bottom">
            <span className="event-meta"><Icon name="pin" className="ico" /><span>{event.city}</span>
              {time && <><i aria-hidden="true" /><bdi className="hours" dir="rtl">{time}</bdi></>}
              {compact && event.venue && <span className="sr-only">{event.venue}</span>}
            </span>
            <span className="event-cta">جزئیات رویداد</span>
          </div>
        </div>
      </a>;
    })}
  </div>;
}

export function Discovery({ masthead, events, initialTopic, initialQuery }: {
  masthead: ReactNode;
  events: LandingEvent[];
  initialTopic: Topic | "all";
  initialQuery: string;
}) {
  const [topic, setTopic] = useState(initialTopic);
  const [query, setQuery] = useState(initialQuery);
  const catalog = useRef<HTMLElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const terms = searchableText(query).split(" ").filter(Boolean);
  const filtered = topic !== "all" || Boolean(query.trim());
  const shown = events.filter(event => {
    if (topic !== "all" && topic !== event.category) return false;
    if (!terms.length) return true;
    const category = topics.find(item => item.id === event.category)?.title;
    const text = searchableText([event.title, event.city, event.venue, category, event.scheduleDate, eventTime(event)].join(" "));
    const compact = text.replaceAll(" ", "");
    return terms.every(term => text.includes(term) || compact.includes(term));
  });
  const emptyTitle = query.trim() ? "نتیجه‌ای برای این جست‌وجو پیدا نشد."
    : topic !== "all" ? "فعلاً رویدادی در این موضوع نداریم." : "قرار بعدی‌ات رو توی تقویم پیدا کن.";

  return <>
    <section className="weekend-hero">
      {masthead}
      <PosterWall initialTopic={initialTopic} onExplore={value => {
        setTopic(value);
        setQuery("");
        results.current?.focus({ preventScroll: true });
        catalog.current?.scrollIntoView({ block: "start" });
      }} />
    </section>

    <section className="wrap catalog" id="experiences" ref={catalog} aria-labelledby="catalog-title">
      <div className="section-head">
        <h2 id="catalog-title">رویدادهای پیش رو</h2>
        <a className="inline-link" href={eventCalendar}>مشاهدهٔ همه <Icon name="chevron-left" className="ico" /></a>
      </div>
      <div className="catalog-toolbar">
        <form className="search-box" role="search" action="/#experiences"
          onSubmit={event => { event.preventDefault(); results.current?.focus(); }}>
          <span className="app-icon icon-search" aria-hidden="true" />
          <label className="sr-only" htmlFor="event-search">جست‌وجو در رویدادها بر اساس نام، موضوع یا محل</label>
          <input id="event-search" name="q" ref={search} value={query} onChange={event => setQuery(event.target.value)}
            autoComplete="off" type="search" placeholder="جست‌وجو در رویدادهای منتخب…" enterKeyHint="search" maxLength={120} />
          {topic !== "all" && <input type="hidden" name="topic" value={topic} />}
          {query && <button type="button" className="search-clear" aria-label="پاک کردن جست‌وجو"
            onClick={() => { setQuery(""); search.current?.focus(); }}><Icon name="close" className="ico" /></button>}
        </form>
        <nav className="chips" aria-label="دسته‌بندی رویدادها">
          {(["all", ...chipOrder] as const).map(value => {
            const label = value === "all" ? "برای تو" : topics.find(item => item.id === value)?.title;
            const params = new URLSearchParams();
            if (value !== "all") params.set("topic", value);
            if (query.trim()) params.set("q", query.trim());
            const href = params.size ? `/?${params}#experiences` : topicHref(value);
            return <a key={value} href={href} className="chip" aria-current={topic === value ? "true" : undefined}
              onClick={event => { if (plainClick(event)) { event.preventDefault(); setTopic(value); } }}>
              {value === "all" && <Icon name="bolt" className="ico" />}{label}
            </a>;
          })}
        </nav>
      </div>
      <div ref={results} tabIndex={-1} aria-label="نتایج رویدادها" role="region">
        <p className="sr-only" role="status">{filtered ? `${shown.length.toLocaleString("fa-IR")} رویداد پیدا شد.` : ""}</p>
        {shown.length > 0 ? <EventCards events={filtered ? shown : shown.slice(0, 6)} compact={filtered} /> : <>
          <div className="landing-empty">
            <div className="empty-guide">
              <span className="theme-mark" aria-hidden="true" />
              <div><h3>{emptyTitle}</h3>
                <p>{filtered ? "موضوع دیگه‌ای رو امتحان کن یا تقویم کامل رو ببین." : "برای دیدن تازه‌ترین برنامه‌ها، به تقویم هم‌قدم سر بزن."}</p>
              </div>
            </div>
            <div className="empty-actions">
              {filtered && <a className="landing-button quiet" href={topicHref("all")} onClick={event => {
                if (!plainClick(event)) return;
                event.preventDefault();
                setTopic("all");
                setQuery("");
                search.current?.focus();
              }}>پاک کردن فیلترها</a>}
              <a className="landing-button primary" href={eventCalendar}>کشف در وب‌اپ <Icon name="arrow-up-left" className="ico" /></a>
            </div>
          </div>
          {filtered && events.length > 0 && <section className="other-events" aria-label="پیشنهادهای دیگر تهران">
            <div className="section-head"><h3>پیشنهادهای دیگر تهران</h3></div>
            <EventCards events={events.slice(0, 6)} />
          </section>}
        </>}
      </div>
    </section>
  </>;
}
