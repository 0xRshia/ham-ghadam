"use client";
import { useMemo, useState } from "react";
import { AppLink } from "@/components/event/app-navigation";
import { useEventBrowse } from "@/components/event/event-browse-provider";
import { useEventCatalog } from "@/hooks/use-event-catalog";
import { useDeadlineClock } from "@/hooks/use-deadline-clock";
import { useResource } from "@/hooks/use-resource";
import { filterEvents } from "@/lib/event-catalog";
import { fa } from "@/lib/types";
import type { Collection, Organizer } from "@/lib/community-types";
import { copy, categoryCopy, categoryLines } from "@/locales/fa";
import { CollectionCard, OrganizerRow, EmptyContent } from "./community";
import { EventCard } from "./event-card";
import { Header, SectionHeading, ErrorState, LoadingState } from "./primitives";
import { FigmaIcon } from "./source-icon";

const normalize = (value: string) => value.replace(/ي/g,"ی").replace(/ك/g,"ک").trim().toLocaleLowerCase("fa");
type ResultKind = "all" | "events" | "collections" | "organizers";
export function Explorer({ showResults = false, freeOnly = false }: { showResults?: boolean; freeOnly?: boolean }) {
  const {filters,updateFilters}=useEventBrowse();
  const [searching,setSearching]=useState(false),[kind,setKind]=useState<ResultKind>(showResults ? "events" : "all");
  const {catalog,loading,error,reload}=useEventCatalog();
  const now=useDeadlineClock(undefined,60000,catalog?.serverNow);
  const resultsMode=searching || !!filters.query || filters.category!=="all" || showResults;
  const collections=useResource<{collections:Collection[]}>(resultsMode ? "/api/collections?discover=true" : null);
  const organizers=useResource<{organizers:Organizer[]}>(resultsMode ? "/api/organizers" : null);
  const events=useMemo(()=>filterEvents(catalog?.events??[],freeOnly ? {...filters,free:true} : filters,now??0),[catalog,filters,now,freeOnly]);
  const counts=useMemo(()=>filterEvents(catalog?.events??[],{...filters,category:"all",query:""},now??0),[catalog,filters,now]);
  const query=normalize(filters.query);
  const matchingCollections=collections.data?.collections.filter(item=>normalize(`${item.title} ${item.description} ${item.owner_name}`).includes(query))??[];
  const matchingOrganizers=organizers.data?.organizers.filter(item=>normalize(`${item.name} ${item.bio} ${item.city}`).includes(query))??[];
  const visibleEvents=query ? events : [...events].sort((a,b)=>b.attendees-a.attendees || a.starts_at-b.starts_at);
  return <main className="el-explorer"><Header title={freeOnly ? copy.freeEvents : copy.explore} actions={<AppLink href="/filters" className="el-icon-button" aria-label={copy.filters}><FigmaIcon screen={32} name="Filter"/></AppLink>}/>
    <form className="el-search" onSubmit={event=>{event.preventDefault();setSearching(true);}}><FigmaIcon screen={32} name="Search"/><input aria-label={copy.searchLabel} placeholder={copy.searchEverything} value={filters.query} onFocus={()=>setSearching(true)} onChange={event=>updateFilters({query:event.target.value})}/>{resultsMode && <button type="button" className="el-icon-button" aria-label={copy.clearSearch} onClick={()=>{updateFilters({query:"",category:"all"});setSearching(false);setKind("all");}}><FigmaIcon screen={33} name="x"/></button>}</form>
    {!resultsMode ? <section className="el-category-browser"><SectionHeading>{copy.browseCategories}</SectionHeading><div className="el-category-list">{categoryCopy.filter(item=>item.id!=="all").map(category=><button key={category.id} className="el-category el-category-3d" onClick={()=>{updateFilters({category:category.id});setKind("events");}}><img src={`/banners/${category.id}.png`} width={1774} height={887} alt=""/><strong>{categoryLines(category.label)}</strong><span>{fa(counts.filter(event=>event.category===category.id).length)} {copy.upcomingCount}</span></button>)}</div><AppLink className="el-button el-button-secondary" href="/events?view=all">{copy.browseAllEvents}</AppLink>{loading && <LoadingState/>}{error && <ErrorState message={error} retry={reload}/>}</section> : <>
      <div className="el-filter-chips" role="group" aria-label={copy.searchResults}>{([{id:"all",label:copy.allResults},{id:"events",label:copy.events},{id:"collections",label:copy.collections},{id:"organizers",label:copy.organizers}] as const).map(tab=><button key={tab.id} aria-pressed={kind===tab.id} onClick={()=>setKind(tab.id)}>{tab.id==="all" && <FigmaIcon screen={33} name="flash"/>}{tab.label}</button>)}</div>
      {(kind==="all"||kind==="events") && <section className="el-search-section"><SectionHeading actions={kind === "all" && visibleEvents.length > 3 ? <button type="button" className="el-text-action" onClick={() => setKind("events")}>{copy.all}</button> : undefined}>{query||filters.category!=="all"?copy.searchResults:copy.popularSearches}</SectionHeading>{loading || now===null ? <LoadingState/> : error ? <ErrorState message={error} retry={reload}/> : visibleEvents.length ? <div className="el-search-events">{visibleEvents.slice(0,kind==="all"?3:100).map(event=><EventCard key={event.id} event={event} variant="list"/>)}</div> : <EmptyContent title={copy.empty}/>}</section>}
      {(kind==="all"||kind==="collections") && <section className="el-search-section"><SectionHeading>{copy.collections}</SectionHeading>{collections.loading ? <LoadingState/> : collections.error ? <ErrorState message={collections.error} retry={collections.reload}/> : matchingCollections.length ? <div className="el-collection-carousel">{matchingCollections.map(collection=><CollectionCard key={collection.id} collection={collection}/>)}</div> : <p className="el-muted">{copy.noSearchResults}</p>}</section>}
      {(kind==="all"||kind==="organizers") && <section className="el-search-section"><SectionHeading>{copy.organizers}</SectionHeading>{organizers.loading ? <LoadingState/> : organizers.error ? <ErrorState message={organizers.error} retry={organizers.reload}/> : matchingOrganizers.length ? matchingOrganizers.map(organizer=><OrganizerRow key={organizer.id} organizer={organizer}/>) : <p className="el-muted">{copy.noSearchResults}</p>}</section>}
    </>}
  </main>;
}
