"use client";
import { eventSortTime } from "@/lib/event-schedule";
import { FigmaIcon, Illustration } from "./source-icon";
import { useMemo } from "react";
import { AppLink, useAppNavigate } from "@/components/event/app-navigation";
import { useEventBrowse } from "@/components/event/event-browse-provider";
import { useEventCatalog } from "@/hooks/use-event-catalog";
import { useCatalogClock } from "@/hooks/use-catalog-clock";
import { filterEvents, groupEvents } from "@/lib/event-catalog";
import { useResource } from "@/hooks/use-resource";
import type { NotificationItem } from "@/lib/community-types";
import { useAuth } from "@/components/event/auth-context";
import { ThemeMenu } from "@/components/event/theme-menu";
import { HomeOrganizers } from "./home-organizers";
import { CatalogSkeleton, HomeHeaderSkeleton } from "./skeleton";
import { SearchLocation } from "./search-location";
import { UpcomingCountdown } from "./upcoming-countdown";
import { copy, categoryCopy } from "@/locales/fa";
import { EventCard } from "./event-card";
import { assets } from "./assets";
import { SourceIcon, SectionHeading, ErrorState, LoadingState, Header, useFavorites } from "./primitives";

export function Catalog({ listing = false, favorites = false, layout = "v1" }: { listing?: boolean; favorites?: boolean; layout?: "v1" | "v2" }) {
  const { user } = useAuth();
  const notifications = useResource<{ notifications: NotificationItem[] }>(user && !listing && !favorites ? "/api/notifications" : null);
  const { catalog, loading, error, refreshError, reload } = useEventCatalog();
  const now = useCatalogClock(catalog);
  const { filters, updateFilters } = useEventBrowse();
  const { ids, loading: favoritesLoading, error: favoritesError } = useFavorites();
  const navigate = useAppNavigate();
  const events = useMemo(() => filterEvents(catalog?.events ?? [], filters, now ?? 0), [catalog, filters, now]);
  const visible = useMemo(() => favorites ? events.filter(event => ids.includes(event.id)) : events, [favorites, events, ids]);
  const suggestions = useMemo(() => groupEvents(visible, catalog?.suggestions ?? [], now ?? 0, filters.sort).suggested, [visible, catalog, now, filters.sort]);
  const popular = useMemo(() => [...visible].sort((a, b) => b.attendees - a.attendees || eventSortTime(a, now ?? 0) - eventSortTime(b, now ?? 0)), [visible, now]);
  const upcoming = useMemo(() => filters.sort === "distance" ? visible : [...visible].sort((a, b) => eventSortTime(a, now ?? 0) - eventSortTime(b, now ?? 0)), [filters.sort, visible, now]);
  const countdown = now !== null && upcoming[0]?.starts_at != null && upcoming[0].starts_at > now && !upcoming[0].schedule ? <UpcomingCountdown startsAt={upcoming[0].starts_at} now={now} /> : undefined;
  return <main className={`el-catalog el-catalog-${layout}`}>
    {listing || favorites ? <Header title={favorites ? copy.favorites : copy.explore} actions={<AppLink className="el-text-action" href="/filters">{copy.filters}</AppLink>} /> :
      <header className="el-home-header"><AppLink href={layout === "v2" ? "/map" : "/filters"} aria-label={copy.chooseCity}>{loading ? <HomeHeaderSkeleton/> : <><span>{copy.near}</span><h1>{filters.city === "all" ? copy.chooseCity : filters.city === "nearby" ? copy.nearby : filters.city}</h1></>}</AppLink><div className="el-home-actions"><ThemeMenu className="el-home-action"/><AppLink href="/notifications" className="el-home-action el-notification" aria-label={copy.notifications}><SourceIcon asset={assets.home.imgNotification} dark={assets["home-dark"].imgNotification} />{notifications.data?.notifications.some(item => item.read_at === null) && <i className="el-notification-dot" aria-hidden="true"/>}</AppLink></div></header>}
    {!favorites && <form className="el-search" onSubmit={event => { event.preventDefault(); navigate("/events?view=all"); }}><SourceIcon asset={assets.home.imgSearch} dark={assets["home-dark"].imgSearch} size={20} /><input aria-label={copy.searchLabel} placeholder={copy.search} value={filters.query} onChange={event => updateFilters({ query: event.target.value })} />{!listing && <SearchLocation />}</form>}
    {!listing && !favorites && layout === "v2" && <div className="el-filter-chips" role="group" aria-label={copy.categories}>{categoryCopy.map(category => <button key={category.id} aria-pressed={filters.category === category.id} onClick={() => updateFilters({ category: category.id })}>{category.id === "all" && <FigmaIcon screen={18} name="flash"/>}{category.id === "all" ? copy.myFeed : category.label}</button>)}</div>}
    {refreshError && <ErrorState message={refreshError} retry={reload} />}
    {loading || (favorites && favoritesLoading) || (!error && now === null) ? (!listing && !favorites ? <CatalogSkeleton layout={layout}/> : <LoadingState />) : (error || (favorites && favoritesError)) ? <ErrorState message={error || favoritesError} retry={reload} /> : !visible.length ?
      <div className="el-empty"><Illustration kind="events" /><h2>{favorites ? copy.favoriteEmpty : copy.empty}</h2><p>{favorites ? copy.favoriteDescription : copy.emptyDescription}</p><AppLink className="el-button el-button-primary" href={favorites ? "/events" : "/filters"}>{favorites ? copy.findEvents : copy.filters}</AppLink></div> :
      listing || favorites ? <div className="el-list-stack">{visible.map(event => <EventCard key={event.id} event={event} variant="list" />)}</div> : <>
        {layout === "v2" ? <section className="el-popular"><SectionHeading href="/events?view=all">{copy.upcoming}</SectionHeading><div className="el-carousel el-feature-carousel">{upcoming.slice(0,8).map((event,index) => <EventCard key={event.id} event={event} variant="feature" priority={index === 0}/>)}</div></section> : <><section className="el-upcoming"><SectionHeading actions={countdown}>{copy.upcoming}</SectionHeading><EventCard event={upcoming[0]} variant="list" priority /></section><section className="el-popular"><SectionHeading href="/events?view=all">{copy.popular}</SectionHeading><div className="el-carousel">{popular.slice(0, 8).map((event, i) => <EventCard key={event.id} event={event} priority={i === 0} />)}</div></section></>}
        {!!suggestions.length && <section className="el-search-section"><SectionHeading href={layout === "v1" ? "/events?view=all" : undefined}>{copy.suggestions}</SectionHeading><div className="el-search-events">{suggestions.slice(0,3).map(({event})=><EventCard key={event.id} event={event} variant="list" action={layout === "v2" ? "price" : "join"}/>)}</div></section>}
      </>}
    {!listing && !favorites && <HomeOrganizers key={user?.id ?? "guest"} userId={user?.id} />}
  </main>;
}
