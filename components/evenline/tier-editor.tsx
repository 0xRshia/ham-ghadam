"use client";
import { useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { api } from "@/lib/client";
import { type TicketTier, digits, fa } from "@/lib/types";
import { MAX_ORDER_TOMAN, MIN_PAID_TOMAN } from "@/lib/payment-limits";
import { copy } from "@/locales/fa";
import { AccountGate } from "./community";
import { Header, Button, ErrorState, LoadingState } from "./primitives";
type Draft = {id:string;name:string;description:string;price:string;capacity:string;active:number};
export function TierEditor({id}:{id:string}) {return <main><Header title={copy.manageTiers} back={`/host/events/${id}`}/><AccountGate><TierEditorContent id={id}/></AccountGate></main>;}
function TierEditorContent({id}:{id:string}) {
  const resource=useResource<{tiers:TicketTier[]}>(`/api/host/events/${id}/tiers`);
  if(resource.loading)return <LoadingState/>;
  if(!resource.data)return <ErrorState message={resource.error} retry={resource.reload}/>;
  return <TierForm id={id} initial={resource.data.tiers}/>;
}
function TierForm({id,initial}:{id:string;initial:TicketTier[]}) {
  const [drafts,setDrafts]=useState<Draft[]>(()=>initial.map(tier=>({...tier,price:String(tier.price),capacity:tier.capacity===null?"":String(tier.capacity)})));
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(false);
  function change(id:string,patch:Partial<Draft>){setSaved(false);setDrafts(current=>current.map(tier=>tier.id===id?{...tier,...patch}:tier));}
  return <form className="el-tier-editor" onSubmit={async event=>{event.preventDefault();setBusy(true);setError("");setSaved(false);try{const tiers=drafts.map(tier=>{const capacity=tier.capacity.trim()===""?null:Number(digits(tier.capacity));if(capacity!==null&&(!Number.isSafeInteger(capacity)||capacity<0))throw new Error(copy.capacityInvalid);return {...tier,price:Number(digits(tier.price)),capacity};});await api(`/api/host/events/${id}/tiers`,{tiers},"PUT");setSaved(true);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}>
    <p className="el-muted">{copy.tiersHint}</p>{drafts.map((tier,index)=><fieldset key={tier.id} disabled={busy} className="el-tier-editor-item"><legend>{copy.chooseTicket} {fa(index+1)}</legend><label className="el-input-field"><span>{copy.tierName}</span><input required maxLength={80} value={tier.name} onChange={event=>change(tier.id,{name:event.target.value})}/></label><label className="el-input-field"><span>{copy.tierDescription}</span><textarea maxLength={2000} rows={3} value={tier.description} onChange={event=>change(tier.id,{description:event.target.value})}/></label><label className="el-input-field"><span>{copy.tierPrice}</span><input dir="ltr" inputMode="numeric" type="number" min={0} max={MAX_ORDER_TOMAN} step={1} required value={tier.price} onChange={event=>change(tier.id,{price:event.target.value})} onBlur={event=>{const amount=Number(event.target.value);event.target.setCustomValidity(amount>0&&amount<MIN_PAID_TOMAN?`${copy.price}: ${fa(MIN_PAID_TOMAN)} ${copy.toman}`:"");}} onInput={event=>event.currentTarget.setCustomValidity("")}/></label><label className="el-input-field"><span>{copy.tierCapacity}</span><input dir="ltr" inputMode="numeric" type="number" min={0} step={1} placeholder={copy.tierUnlimited} value={tier.capacity} onChange={event=>change(tier.id,{capacity:event.target.value})}/></label><label className="el-setting"><strong>{copy.tierActive}</strong><input type="checkbox" className="el-toggle" role="switch" checked={tier.active===1} onChange={event=>change(tier.id,{active:event.target.checked?1:0})}/></label></fieldset>)}
    <Button type="button" variant="secondary" disabled={busy||drafts.length>=12} onClick={()=>{setSaved(false);setDrafts(current=>[...current,{id:crypto.randomUUID(),name:"",description:"",price:"0",capacity:"",active:1}]);}}>{copy.addTier}</Button>{error&&<ErrorState message={error}/>} {saved&&<p role="status">{copy.changesSaved}</p>}<Button disabled={busy||!drafts.length}>{copy.saveChanges}</Button>
  </form>;
}
