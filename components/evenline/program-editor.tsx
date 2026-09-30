"use client";
import { useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { api } from "@/lib/client";
import { persianInput, parsePersianDate } from "@/lib/persian-date";
import { clock, date, digits, fa, type EventItem, type EventProgram } from "@/lib/types";
import { copy } from "@/locales/fa";
import { AccountGate } from "./community";
import { Header,Button,LoadingState,ErrorState } from "./primitives";
type Series={id:string;title:string};
type AgendaDraft={id:string;title:string;speaker:string;image_url:string;startDate:string;startTime:string;endDate:string;endTime:string};
export function ProgramEditor({id}:{id:string}) {
  return <main><Header title={copy.manageProgram} back={`/host/events/${id}`}/><AccountGate><EditorContent id={id}/></AccountGate></main>;
}
function EditorContent({id}:{id:string}) {
  const resource=useResource<{event:EventItem;program:EventProgram}>(`/api/host/events/${id}/program`);
  const series=useResource<{series:Series[]}>("/api/host/event-series");
  if(resource.loading||series.loading)return <LoadingState/>;
  if(!resource.data||!series.data)return <ErrorState message={resource.error||series.error} retry={()=>{resource.reload();series.reload();}}/>;
  return <ProgramForm event={resource.data.event} initial={resource.data.program} initialSeries={series.data.series}/>;
}
function ProgramForm({event,initial,initialSeries}:{event:EventItem;initial:EventProgram;initialSeries:Series[]}) {
  const [agenda,setAgenda]=useState<AgendaDraft[]>(()=>initial.agenda.map(item=>({...item,image_url:item.image_url??"",startDate:persianInput(item.starts_at),startTime:digits(clock(item.starts_at)),endDate:persianInput(item.ends_at),endTime:digits(clock(item.ends_at))})));
  const [revision,setRevision]=useState(initial.revision),[video,setVideo]=useState(initial.video_url??""),[seriesId,setSeriesId]=useState(initial.series_id??"");
  const [series,setSeries]=useState(initialSeries),[seriesName,setSeriesName]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(false);
  function change(id:string,patch:Partial<AgendaDraft>){setSaved(false);setAgenda(items=>items.map(item=>item.id===id?{...item,...patch}:item));}
  async function save(){setBusy(true);setError("");setSaved(false);try{
    const items=agenda.map(item=>({id:item.id,title:item.title,speaker:item.speaker,image_url:item.image_url||null,starts_at:parsePersianDate(item.startDate,item.startTime),ends_at:parsePersianDate(item.endDate,item.endTime)}));
    if(items.some(item=>!Number.isFinite(item.starts_at)||!Number.isFinite(item.ends_at)))throw new Error(copy.dateInvalid);
    const result=await api<{program:EventProgram}>(`/api/host/events/${event.id}/program`,{agenda:items,video_url:video||null,series_id:seriesId||null,revision},"PUT");setRevision(result.program.revision);setSaved(true);
  }catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  return <form className="el-tier-editor" onSubmit={event=>{event.preventDefault();void save();}} onChange={()=>setSaved(false)}>
    <p>{copy.programHint}</p><p className="el-muted">{date(event.starts_at,true)} · {clock(event.starts_at)} — {date(event.ends_at)} · {clock(event.ends_at)}</p>
    <fieldset disabled={busy} className="el-tier-editor-item"><label className="el-input-field"><span>{copy.videoUrl}</span><input type="url" dir="ltr" maxLength={2048} value={video} onChange={event=>setVideo(event.target.value)}/></label><p className="el-muted">{copy.videoHint}</p><label className="el-input-field"><span>{copy.series}</span><select aria-label={copy.series} value={seriesId} onChange={event=>setSeriesId(event.target.value)}><option value="">{copy.noSeries}</option>{series.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label><p className="el-muted">{copy.seriesHint}</p><label className="el-input-field"><span>{copy.newSeries}</span><input maxLength={100} value={seriesName} onChange={event=>setSeriesName(event.target.value)}/></label><Button type="button" variant="secondary" disabled={seriesName.trim().length<2} onClick={async()=>{setBusy(true);setError("");try{const result=await api<{series:Series}>("/api/host/event-series",{title:seriesName});setSeries(items=>[result.series,...items]);setSeriesId(result.series.id);setSeriesName("");setSaved(false);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}>{copy.createSeries}</Button></fieldset>
    <h2>{copy.agenda}</h2>{agenda.map((item,index)=><fieldset key={item.id} disabled={busy} className="el-tier-editor-item"><legend>{copy.agenda} {fa(index+1)}</legend><label className="el-input-field"><span>{copy.agendaTitle}</span><input required maxLength={100} value={item.title} onChange={event=>change(item.id,{title:event.target.value})}/></label><label className="el-input-field"><span>{copy.speaker}</span><input required maxLength={80} value={item.speaker} onChange={event=>change(item.id,{speaker:event.target.value})}/></label><label className="el-input-field"><span>{copy.speakerImage}</span><input dir="ltr" maxLength={2048} value={item.image_url} onChange={event=>change(item.id,{image_url:event.target.value})}/></label>{(["start","end"] as const).map(side=><div key={side} className="el-program-time"><label className="el-input-field"><span>{side==="start"?copy.startsAt:copy.endsAt} · {copy.dateInput}</span><input required dir="ltr" value={item[`${side}Date`]} onChange={event=>change(item.id,{[`${side}Date`]:event.target.value})}/></label><label className="el-input-field"><span>{copy.time}</span><input required type="time" dir="ltr" value={item[`${side}Time`]} onChange={event=>change(item.id,{[`${side}Time`]:event.target.value})}/></label></div>)}<Button type="button" variant="secondary" onClick={()=>{setAgenda(items=>items.filter(other=>other.id!==item.id));setSaved(false);}}>{copy.removeAgenda}</Button></fieldset>)}
    <Button type="button" variant="secondary" disabled={busy||agenda.length>=24} onClick={()=>{setSaved(false);setAgenda(items=>[...items,{id:crypto.randomUUID(),title:"",speaker:"",image_url:"",startDate:persianInput(event.starts_at),startTime:digits(clock(event.starts_at)),endDate:persianInput(event.ends_at),endTime:digits(clock(event.ends_at))}]);}}>{copy.addAgenda}</Button>
    {error&&<ErrorState message={error}/>} {saved&&<p role="status">{copy.changesSaved}</p>}<Button disabled={busy}>{copy.saveChanges}</Button>
  </form>;
}
