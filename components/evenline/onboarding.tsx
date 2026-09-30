"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppNavigate } from "@/components/event/app-navigation";
import { useEventBrowse } from "@/components/event/event-browse-provider";
import { useResource } from "@/hooks/use-resource";
import { useEventCatalog } from "@/hooks/use-event-catalog";
import { api } from "@/lib/client";
import { loginDestination } from "@/lib/login-destination";
import type { Profile, Organizer } from "@/lib/community-types";
import { copy, categoryCopy } from "@/locales/fa";
import { AccountGate, OrganizerCard, EmptyContent } from "./community";
import { Header, Button, LoadingState, ErrorState, SectionHeading } from "./primitives";
import type { MapConfiguration } from "@/lib/map-configuration";
import { MapPreview, MapAttribution } from "./map-preview";
import { FigmaIcon } from "./source-icon";

export function OnboardingPage({configuration}:{configuration:MapConfiguration}) { return <Suspense fallback={<LoadingState/>}><AccountGate><ProfileSetup configuration={configuration}/></AccountGate></Suspense>; }
function ProfileSetup({configuration}:{configuration:MapConfiguration}) {
  const resource=useResource<{profile:Profile}>("/api/profile");
  return resource.loading ? <LoadingState/> : !resource.data ? <ErrorState message={resource.error} retry={resource.reload}/> : <SetupSteps profile={resource.data.profile} configuration={configuration}/>;
}
function SetupSteps({ profile,configuration }: { profile: Profile; configuration:MapConfiguration }) {
  const [step,setStep]=useState(0),[query,setQuery]=useState(""),[city,setCity]=useState(profile.city),[interests,setInterests]=useState(profile.interests);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{window.scrollTo({top:0,behavior:"instant"});},[step]);
  const catalog=useEventCatalog(),organizers=useResource<{organizers:Organizer[]}>("/api/organizers");
  const {updateFilters}=useEventBrowse();const navigate=useAppNavigate();const params=useSearchParams();
  const cities=[...new Set(catalog.catalog?.events.map(event=>event.city).filter(Boolean))].filter(value=>value.includes(query.trim()));
  const cityPoint=(city:string)=>{const events=catalog.catalog?.events.filter(event=>event.city===city&&event.lat!==null&&event.lng!==null)??[];return events.length?{lat:events.reduce((sum,event)=>sum+event.lat!,0)/events.length,lng:events.reduce((sum,event)=>sum+event.lng!,0)/events.length}:null;};
  async function finish() {setBusy(true);setError("");try{await api("/api/profile",{city,interests,onboarding_completed:true},"PATCH");navigate(loginDestination(params.get("next")),{replace:true});}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  function next(){setQuery("");setError("");if(step===2)void finish();else setStep(step+1);}
  function locate() {
    if(!navigator.geolocation){setError(copy.locationDenied);return;}
    setBusy(true);setError("");
    navigator.geolocation.getCurrentPosition(position=>{updateFilters({city:"nearby",sort:"distance",point:{lat:position.coords.latitude,lng:position.coords.longitude,label:copy.currentLocation}});setBusy(false);next();},()=>{setBusy(false);setError(copy.locationDenied);},{timeout:10000,maximumAge:60000,enableHighAccuracy:false});
  }
  return <main className="el-setup-page"><Header back="/account" onBack={step ? ()=>{setStep(step-1);setQuery("");setError("");} : undefined} actions={<button className="el-text-action" disabled={busy} onClick={next}>{copy.skip}</button>}/><div className="el-setup-content"><div className="el-setup-heading"><h1>{[copy.chooseLocation,copy.followOrganizerTitle,copy.chooseInterests][step]}</h1><p>{[copy.locationHint,copy.followOrganizerHint,copy.interestsHint][step]}</p></div>
    <label className="el-search"><FigmaIcon screen={step===0?13:14} name={step===0?"map-pin":"Search"}/><input aria-label={[copy.searchCities,copy.searchOrganizers,copy.searchInterests][step]} placeholder={[copy.searchCities,copy.searchOrganizers,copy.searchInterests][step]} value={query} onChange={event=>setQuery(event.target.value)}/></label>
    {step===0 ? <><Button variant="secondary" className="el-location-action" disabled={busy} onClick={locate}><FigmaIcon screen={13} name="current-location"/>{copy.currentLocation}</Button><section className="el-setup-cities"><SectionHeading>{copy.availableCities}</SectionHeading>{catalog.loading ? <LoadingState/> : catalog.error ? <ErrorState message={catalog.error} retry={catalog.reload}/> : cities.map(value=>{const point=cityPoint(value);return <button key={value} className="el-city-card" onClick={()=>{setCity(value);updateFilters({city:value,point:null});next();}}><span><strong>{value}</strong><small>{value}، {copy.iran}</small></span><span className="el-city-map">{point&&<MapPreview lat={point.lat} lng={point.lng} configuration={configuration} city/>}<FigmaIcon screen={13} name="map-pin" size={20}/></span></button>;})}{cities.some(value=>cityPoint(value))&&<MapAttribution configuration={configuration}/>}</section></> : step===1 ? <section className="el-setup-organizers"><SectionHeading>{copy.recommendedOrganizers}</SectionHeading>{organizers.loading ? <LoadingState/> : organizers.error ? <ErrorState message={organizers.error} retry={organizers.reload}/> : !organizers.data?.organizers.length ? <EmptyContent title={copy.noFollowing}/> : <div className="el-collection-carousel">{organizers.data.organizers.filter(organizer=>organizer.name.includes(query.trim())).map(organizer=><OrganizerCard key={organizer.id} organizer={organizer}/>)}</div>}</section> : <div className="el-interest-choices">{categoryCopy.filter(item=>item.id!=="all" && item.label.includes(query.trim())).map(item=><button key={item.id} aria-pressed={interests.includes(item.id)} onClick={()=>setInterests(current=>current.includes(item.id)?current.filter(id=>id!==item.id):[...current,item.id])}>{interests.includes(item.id)?<FigmaIcon screen={15} name="check"/>:<span className="el-interest-dot"/>}{item.label}</button>)}</div>}
    {error && <ErrorState message={error}/>} {step>0 && <Button className="el-setup-continue" disabled={busy} onClick={next}>{copy.continue}</Button>}
  </div></main>;
}
