"use client";
import { useState } from "react";
import { AppLink, useAppNavigate } from "@/components/event/app-navigation";
import { useResource } from "@/hooks/use-resource";
import { useEventCatalog } from "@/hooks/use-event-catalog";
import { api } from "@/lib/client";
import type { Collection } from "@/lib/community-types";
import { fa, type EventItem } from "@/lib/types";
import { copy } from "@/locales/fa";
import { AccountGate, EmptyContent, FollowControl } from "./community";
import { Header, Button, ErrorState, LoadingState } from "./primitives";
import { EventCard } from "./event-card";
import { ConfirmSheet } from "./confirm-sheet";

type CollectionDetail = { collection: Collection; events: EventItem[]; editable: boolean };
export function CollectionPage({ id, edit = false }: { id: string; edit?: boolean }) {
  const resource = useResource<CollectionDetail>(`/api/collections/${encodeURIComponent(id)}`);
  const data = resource.data;
  return <main><Header title={edit ? copy.editCollection : copy.collections} back={edit ? `/collections/${id}` : "/account"} actions={data?.editable && !edit ? <AppLink className="el-text-action" href={`/collections/${id}/edit`}>{copy.edit}</AppLink> : undefined}/>
    {resource.loading ? <LoadingState/> : !data ? <ErrorState message={resource.error} retry={resource.reload}/> : edit ? <AccountGate>{data.editable ? <CollectionEditor key={id} data={data}/> : <ErrorState message={copy.collectionUnavailable}/>}</AccountGate> : <>
      <section className="el-collection-detail">{data.collection.image && <img className="el-collection-cover" src={data.collection.image} alt=""/>}<h1>{data.collection.title}</h1>{data.collection.owner_is_organizer ? <AppLink className="el-muted" href={`/organizers/${data.collection.owner_id}`}>{copy.by} {data.collection.owner_name}</AppLink> : <span className="el-muted">{copy.by} {data.collection.owner_name}</span>}{!data.collection.published && <span className="el-muted">{copy.collectionDraft}</span>}<p>{data.collection.description}</p><div className="el-collection-detail-meta"><span>{fa(data.collection.event_count)} {copy.upcomingCount}</span><span>{fa(data.collection.followers)} {copy.followers}</span></div>{!data.editable && <FollowControl resource="collections" id={id} ownerId={data.collection.owner_id} following={data.collection.following} onChange={resource.reload}/>}</section>
      {data.events.length ? <div className="el-list-stack">{data.events.map(event=><EventCard key={event.id} event={event} variant="list"/>)}</div> : <EmptyContent title={copy.noCollectionEvents}/>}
    </>}
  </main>;
}

function CollectionEditor({ data }: { data: CollectionDetail }) {
  const navigate = useAppNavigate();
  const catalog = useEventCatalog();
  const [title,setTitle] = useState(data.collection.title), [description,setDescription] = useState(data.collection.description);
  const [published,setPublished] = useState(!!data.collection.published), [ids,setIds] = useState(data.events.map(event=>event.id));
  const [query,setQuery] = useState(""), [busy,setBusy] = useState(false), [error,setError] = useState(""), [deleting,setDeleting] = useState(false);
  const events = new Map([...data.events,...(catalog.catalog?.events ?? [])].map(event=>[event.id,event]));
  const options = [...events.values()].filter(event=>!ids.includes(event.id) && `${event.title} ${event.venue}`.includes(query.trim()));
  function move(index: number, direction: number) { setIds(current=>{const next=[...current];[next[index],next[index+direction]]=[next[index+direction],next[index]];return next;}); }
  async function save() {
    setBusy(true);setError("");
    try { await api(`/api/collections/${data.collection.id}`,{title,description,published,eventIds:ids},"PATCH");navigate(`/collections/${data.collection.id}`); }
    catch(error){setError((error as Error).message);}finally{setBusy(false);}
  }
  async function remove() {
    setBusy(true);setError("");
    try { await api(`/api/collections/${data.collection.id}`,{},"DELETE");navigate("/account"); }
    catch(error){setDeleting(false);setError((error as Error).message);}finally{setBusy(false);}
  }
  return <><form className="el-collection-editor" onSubmit={event=>{event.preventDefault();void save();}}>
    <label className="el-input-field"><span>{copy.collectionTitle}</span><input value={title} onChange={event=>setTitle(event.target.value)} required minLength={2} maxLength={100}/></label>
    <label className="el-input-field"><span>{copy.collectionDescription}</span><textarea value={description} onChange={event=>setDescription(event.target.value)} maxLength={2000} rows={3}/></label>
    <label className="el-collection-publish"><span>{copy.collectionPublished}</span><input type="checkbox" className="el-toggle" role="switch" checked={published} onChange={event=>setPublished(event.target.checked)}/></label>
    <h2>{copy.collectionEvents}</h2><p className="el-muted">{copy.collectionSelectHint}</p>
    <ol className="el-collection-selection">{ids.map((id,index)=><li key={id}><span>{fa(index+1)}. {events.get(id)?.title}</span><div><button type="button" className="el-text-action" disabled={index===0 || busy} onClick={()=>move(index,-1)}>{copy.moveEarlier}</button><button type="button" className="el-text-action" disabled={index===ids.length-1 || busy} onClick={()=>move(index,1)}>{copy.moveLater}</button><button type="button" className="el-text-action" disabled={busy} onClick={()=>setIds(ids.filter(value=>value!==id))}>{copy.removeEvent}</button></div></li>)}</ol>
    <label className="el-input-field"><span>{copy.searchLabel}</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)}/></label>
    {catalog.loading ? <LoadingState/> : catalog.error ? <ErrorState message={catalog.error} retry={catalog.reload}/> : <div className="el-collection-options">{options.map(event=><label key={event.id}><input type="checkbox" checked={false} disabled={ids.length>=100 || busy} onChange={()=>setIds(current=>[...current,event.id])}/><span>{event.title}</span></label>)}</div>}
    {error && <ErrorState message={error}/>}<Button disabled={busy} type="submit">{copy.saveChanges}</Button><Button type="button" variant="secondary" disabled={busy} onClick={()=>setDeleting(true)}>{copy.deleteCollection}</Button>
  </form><ConfirmSheet open={deleting} title={copy.deleteCollectionConfirm} action={copy.delete} busy={busy} onClose={()=>setDeleting(false)} onConfirm={()=>void remove()}/></>;
}
