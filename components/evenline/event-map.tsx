"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { AppLink } from "@/components/event/app-navigation";
import { useEventBrowse } from "@/components/event/event-browse-provider";
import { useEventCatalog } from "@/hooks/use-event-catalog";
import { useDeadlineClock } from "@/hooks/use-deadline-clock";
import { filterEvents } from "@/lib/event-catalog";
import type { MapConfiguration } from "@/lib/map-configuration";
import { fa, type EventItem } from "@/lib/types";
import { copy, categoryCopy } from "@/locales/fa";
import { FigmaIcon } from "./source-icon";
import { EventCard } from "./event-card";
import { ErrorState, LoadingState } from "./primitives";
import icons from "./source-icons.json";

type MappedEvent = EventItem & {lat:number;lng:number;distance:number|undefined};
function MapCanvas({events,configuration,point,onSelect}:{events:MappedEvent[];configuration:MapConfiguration;point:{lat:number;lng:number}|null;onSelect:(id:string)=>void}) {
  const container=useRef<HTMLDivElement>(null), select=useRef(onSelect);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{select.current=onSelect;},[onSelect]);
  useEffect(()=>{
    if(!container.current || !events.length)return;
    let active=true,map:Leaflet.Map|undefined,observer:ResizeObserver|undefined;
    void import("leaflet").then(L=>{
      if(!active || !container.current)return;
      map=L.map(container.current,{zoomControl:false,attributionControl:false});
      const attribution=document.createElement("a");attribution.href=configuration.attributionUrl;attribution.textContent=configuration.attributionLabel;attribution.target="_blank";attribution.rel="noopener noreferrer";
      L.control.attribution({prefix:false,position:"bottomleft"}).addTo(map).addAttribution(attribution.outerHTML);
      L.tileLayer(configuration.tileUrl,{maxZoom:19,keepBuffer:1,updateWhenIdle:true}).on("tileerror",()=>{if(active)setFailed(true);}).on("tileload",()=>{if(active)setFailed(false);}).addTo(map);
      const bounds=L.latLngBounds(events.map(event=>[event.lat,event.lng]));
      for(const event of events){
        const iconName=event.category==="music"?"music":event.category==="art"?"palette":"map-pin";
        const marker=document.createElement("span");marker.className=`el-map-marker el-map-marker-${iconName}`;marker.dir="rtl";
        const symbol=document.createElement("span");symbol.className="el-map-marker-symbol";
        for(const theme of ["light","dark"] as const){const img=document.createElement("img");img.src=icons[35][iconName][0][theme].src;img.width=16;img.height=16;img.alt="";img.className=`el-${theme}-asset`;symbol.appendChild(img);}
        const label=document.createElement("span");label.textContent=event.distance===undefined ? categoryCopy.find(category=>category.id===event.category)?.label??copy.events : `${fa(Math.round(event.distance))} ${copy.kilometers}`;
        marker.appendChild(symbol);marker.appendChild(label);
        const pin=L.marker([event.lat,event.lng],{title:event.title,alt:event.title,keyboard:true,icon:L.divIcon({html:marker,className:"el-map-pin",iconSize:[84,40],iconAnchor:[42,20]})}).addTo(map).on("click",()=>select.current(event.id));
        pin.getElement()?.setAttribute("aria-label",event.title);
      }
      if(point){L.circleMarker([point.lat,point.lng],{radius:24,color:"var(--el-accent)",opacity:0.1,weight:1,fillColor:"var(--el-others-white)",fillOpacity:0.7}).addTo(map);L.circleMarker([point.lat,point.lng],{radius:8,color:"var(--el-others-white)",weight:6,fillColor:"var(--el-accent)",fillOpacity:1}).addTo(map);bounds.extend([point.lat,point.lng]);}
      map.fitBounds(bounds,{paddingTopLeft:[48,160],paddingBottomRight:[48,48],maxZoom:14});
      observer=new ResizeObserver(()=>map?.invalidateSize());observer.observe(container.current);
    }).catch(()=>{if(active)setFailed(true);});
    return()=>{active=false;observer?.disconnect();map?.remove();};
  },[events,configuration,point]);
  return <><div className="el-map-canvas" ref={container} role="region" aria-label={copy.map} dir="ltr"/>{failed && <p className="el-map-warning" role="status">{copy.mapUnavailable}</p>}</>;
}
export function EventMap({configuration}:{configuration:MapConfiguration}) {
  const {filters,updateFilters}=useEventBrowse();
  const {catalog,loading,error,reload}=useEventCatalog();const now=useDeadlineClock(undefined,60000,catalog?.serverNow);
  const [selected,setSelected]=useState<string|null>(null),[locationError,setLocationError]=useState(""),[locating,setLocating]=useState(false);
  const events=useMemo(()=>filterEvents(catalog?.events??[],filters,now??0).filter((event):event is MappedEvent=>event.lat!==null&&event.lng!==null&&Number.isFinite(event.lat)&&Number.isFinite(event.lng)),[catalog,filters,now]);
  const selectedEvent=events.find(event=>event.id===selected);
  const ordered=selectedEvent?[selectedEvent,...events.filter(event=>event.id!==selectedEvent.id)]:events;
  function locate(){if(!navigator.geolocation){setLocationError(copy.locationDenied);return;}setLocating(true);setLocationError("");navigator.geolocation.getCurrentPosition(position=>{updateFilters({point:{lat:position.coords.latitude,lng:position.coords.longitude,label:copy.currentLocation},city:"nearby",sort:"distance"});setLocating(false);},()=>{setLocationError(copy.locationDenied);setLocating(false);},{timeout:10000,maximumAge:60000,enableHighAccuracy:false});}
  return <main className="el-map-page">
    {!!events.length && <MapCanvas events={events} configuration={configuration} point={filters.point} onSelect={setSelected}/>}
    <div className="el-map-controls"><div className="el-search"><AppLink className="el-icon-button" href="/events" aria-label={copy.back}><FigmaIcon screen={32} name="arrow-narrow-left" directional/></AppLink><input aria-label={copy.searchLabel} placeholder={copy.search} value={filters.query} onChange={event=>updateFilters({query:event.target.value})}/><AppLink className="el-icon-button" href="/filters" aria-label={copy.filters}><FigmaIcon screen={32} name="Filter"/></AppLink></div><div className="el-filter-chips" role="group" aria-label={copy.categories}>{categoryCopy.map(category=><button key={category.id} aria-pressed={filters.category===category.id} onClick={()=>updateFilters({category:category.id})}>{category.id==="all"&&<FigmaIcon screen={35} name="flash"/>}{category.label}</button>)}</div><button className="el-map-locate" disabled={locating} onClick={locate}><FigmaIcon screen={13} name="current-location"/>{copy.locationShort}</button></div>
    {locationError && <p className="el-map-warning" role="alert">{locationError}</p>}
    <section className="el-map-results" aria-label={copy.mapEvents}><div className="el-sheet-handle"/>{loading || now===null ? <LoadingState/> : error ? <ErrorState message={error} retry={reload}/> : !ordered.length ? <p className="el-status">{copy.noMapEvents}</p> : <div className="el-map-result-list">{ordered.map(event=><div key={event.id} className={event.id===selected?"el-map-selected":""}><EventCard event={event} variant="list"/></div>)}</div>}</section>
  </main>;
}
