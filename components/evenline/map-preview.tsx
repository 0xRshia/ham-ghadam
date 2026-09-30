"use client";
import { useEffect,useRef,useState } from "react";
import type * as Leaflet from "leaflet";
import type { MapConfiguration } from "@/lib/map-configuration";
import { copy } from "@/locales/fa";
export function MapPreview({lat,lng,configuration,city=false}:{lat:number;lng:number;configuration:MapConfiguration;city?:boolean}) {
  const element=useRef<HTMLSpanElement>(null),[failed,setFailed]=useState(false);
  useEffect(()=>{
    let active=true,started=false,map:Leaflet.Map|undefined;
    const observer=new IntersectionObserver(entries=>{if(!entries.some(entry=>entry.isIntersecting)||started)return;started=true;observer.disconnect();void import("leaflet").then(L=>{
      if(!active||!element.current)return;
      map=L.map(element.current,{zoomControl:false,attributionControl:false,dragging:false,touchZoom:false,doubleClickZoom:false,scrollWheelZoom:false,boxZoom:false,keyboard:false}).setView([lat,lng],city?10:15);
      L.tileLayer(configuration.tileUrl,{maxZoom:19,keepBuffer:0,updateWhenIdle:true}).on("tileerror",()=>{if(active)setFailed(true);}).on("tileload",()=>{if(active)setFailed(false);}).addTo(map);
      if(!city)L.circleMarker([lat,lng],{radius:10,color:"var(--el-others-white)",weight:4,fillColor:"var(--el-accent)",fillOpacity:1}).addTo(map);
    }).catch(()=>{if(active)setFailed(true);});});
    if(element.current)observer.observe(element.current);
    return()=>{active=false;observer.disconnect();map?.remove();};
  },[lat,lng,configuration,city]);
  return <><span ref={element} className="el-map-preview" dir="ltr" aria-hidden="true"/>{failed&&!city&&<span className="el-preview-error" role="status">{copy.mapUnavailable}</span>}</>;
}
export function MapAttribution({configuration}:{configuration:MapConfiguration}) {
  return <a className="el-map-credit" dir="ltr" href={configuration.attributionUrl} target="_blank" rel="noopener noreferrer">{configuration.attributionLabel}</a>;
}
