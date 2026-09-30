"use client";
import { useEffect, useRef, useState } from "react";
import { AppLink, useAppNavigate } from "@/components/event/app-navigation";
import { useResource } from "@/hooks/use-resource";
import { useDeadlineClock } from "@/hooks/use-deadline-clock";
import { groupReservations, type ReservationTab } from "@/lib/reservation-history";
import { api } from "@/lib/client";
import { date, clock, fa, type Reservation } from "@/lib/types";
import { persianInput, parsePersianDate } from "@/lib/persian-date";
import type { TicketDownloadResponse } from "@/lib/ticket-types";
import { copy } from "@/locales/fa";
import { Header, Button, ErrorState, LoadingState } from "./primitives";
import { AccountGate, EmptyContent } from "./community";
import { FigmaIcon } from "./source-icon";
import { TicketBarcode } from "./ticket-barcode";
import { ConfirmSheet } from "./confirm-sheet";

export function TicketsPage() { return <main className="el-tickets-page"><Header title={copy.tickets} /><AccountGate><TicketsContent /></AccountGate></main>; }
function TicketsContent() {
  const resource = useResource<{ reservations: Reservation[]; serverNow: number }>("/api/reservations");
  const [tab,setTab]=useState<ReservationTab>("upcoming");const [day,setDay]=useState<number | null>(null);
  const now=useDeadlineClock(undefined,60000,resource.data?.serverNow);
  if(resource.loading||now===null)return <LoadingState />;
  if(resource.error||!resource.data)return <ErrorState message={resource.error} retry={resource.reload} />;
  const groups=groupReservations(resource.data.reservations,now);
  const visible=groups[tab].filter(item=>day===null||persianInput(item.starts_at)===persianInput(day));
  return <><TicketCalendar now={now} day={day} onChange={setDay}/>
    <div className="el-segmented" role="group" aria-label={copy.tickets}>{([{id:"upcoming",label:copy.upcomingTickets},{id:"past",label:copy.past},{id:"cancelled",label:copy.cancelled}] as const).map(item=><button key={item.id} aria-pressed={tab===item.id} onClick={()=>{setTab(item.id);setDay(null);}}>{item.label} ({fa(groups[item.id].length)})</button>)}</div>
    {!visible.length?<EmptyContent title={copy.noTickets}/>:<div className="el-list-stack el-booking-list">{visible.map(reservation=><BookingCard key={reservation.id} reservation={reservation} past={tab!=="upcoming"}/>)}</div>}
  </>;
}
function BookingCard({ reservation, past }: { reservation: Reservation; past: boolean }) {
  const summary = reservation.ticket_items?.length ? reservation.ticket_items.map(item=>`${item.name} × ${fa(item.quantity)}`).join("، ") : `${copy.regular} × ${fa(reservation.quantity)}`;
  return <article className={`el-booking-card${past ? " el-booking-past" : ""}`}><AppLink href={`/reservations/${reservation.id}`}><div className="el-booking-top"><h2>{reservation.title}</h2><span className="el-booking-category" data-category={reservation.category}><FigmaIcon screen={38} name={reservation.category==="art" ? "palette" : reservation.category==="music" ? "music" : "ticket"}/></span></div><div className="el-booking-bottom"><dl><div><dt>{copy.time}</dt><dd>{clock(reservation.starts_at)}</dd></div><div><dt>{copy.dates}</dt><dd>{new Intl.DateTimeFormat("fa-IR-u-ca-persian",{timeZone:"Asia/Tehran",day:"numeric",month:"short"}).format(reservation.starts_at)}</dd></div></dl><span className="el-booking-tier" title={summary}>{summary}</span></div></AppLink></article>;
}
function TicketCalendar({ now, day, onChange }: { now: number; day: number | null; onChange: (day: number | null) => void }) {
  const [start,setStart]=useState(now),[open,setOpen]=useState(false),[error,setError]=useState("");
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
  const days=Array.from({length:5},(_,index)=>start+index*86400000);
  return <><div className="el-ticket-calendar"><div><div className="el-calendar-month"><button className="el-icon-button" aria-label={copy.previousDates} onClick={()=>setStart(start-5*86400000)}><FigmaIcon screen={38} name="chevron-left" directional/></button><h2>{new Intl.DateTimeFormat("fa-IR-u-ca-persian",{timeZone:"Asia/Tehran",month:"long",year:"numeric"}).format(start)}</h2><button className="el-icon-button" aria-label={copy.nextDates} onClick={()=>setStart(start+5*86400000)}><FigmaIcon screen={38} name="chevron-left"/></button></div><button className="el-icon-button" aria-label={copy.selectDate} onClick={()=>setOpen(true)}><FigmaIcon screen={38} name="calendar"/></button></div><div className="el-calendar-dates">{days.map(time=><button key={time} aria-label={date(time,true)} aria-pressed={day!==null&&persianInput(time)===persianInput(day)} onClick={()=>onChange(day!==null&&persianInput(time)===persianInput(day)?null:time)}><strong>{new Intl.DateTimeFormat("fa-IR-u-ca-persian",{timeZone:"Asia/Tehran",day:"numeric"}).format(time)}</strong><span>{new Intl.DateTimeFormat("fa-IR",{timeZone:"Asia/Tehran",weekday:"short"}).format(time)}</span></button>)}</div><span className="el-calendar-handle"/></div><dialog ref={dialog} className="el-sheet" aria-label={copy.selectDate} onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)}><form className="el-date-selection" onSubmit={event=>{event.preventDefault();const value=String(new FormData(event.currentTarget).get("date"));const time=parsePersianDate(value,"12:00");if(!Number.isFinite(time)){setError(copy.dateInvalid);return;}setStart(time);onChange(time);setOpen(false);setError("");}}><label className="el-input-field"><span>{copy.dateInput}</span><input name="date" dir="ltr" autoFocus placeholder={copy.dateExample} required defaultValue={persianInput(day??now)}/></label>{error&&<ErrorState message={error}/>}<Button type="submit">{copy.apply}</Button><Button type="button" variant="secondary" onClick={()=>{onChange(null);setOpen(false);}}>{copy.allDays}</Button><button type="button" className="el-text-action" onClick={()=>setOpen(false)}>{copy.close}</button></form></dialog></>;
}
export function TicketPage({ id, qr = false }: { id: string; qr?: boolean }) {
  return <main className={`el-ticket-page${qr ? " el-ticket-qr-page" : ""}`}><Header title={qr?copy.entryCode:copy.ticketDetail} back={qr?`/reservations/${id}`:"/reservations"}/><AccountGate><TicketContent id={id} qr={qr}/></AccountGate></main>;
}
function TicketContent({ id, qr }: { id: string; qr: boolean }) {
  const resource=useResource<{reservation:Reservation;items:{tier_name:string;quantity:number;unit_price:number}[];serverNow:number}>(`/api/reservations/${encodeURIComponent(id)}`);
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [cancelling,setCancelling]=useState(false);const navigate=useAppNavigate();
  if(resource.loading)return <LoadingState/>;
  if(!resource.data)return <ErrorState message={resource.error} retry={resource.reload}/>;
  const {reservation}=resource.data;
  async function action(action:string){setBusy(true);setError("");try{const result=await api<{paymentUrl?:string}>(`/api/reservations/${id}`,{action});if(result.paymentUrl)window.location.assign(result.paymentUrl);else resource.reload();}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  if(reservation.status!=="confirmed")return <div className="el-checkout-content"><h1>{reservation.title}</h1><p>{reservation.status==="hold"?copy.bookingPending:reservation.status==="paid_unfulfilled"?copy.paymentFollowup:copy.cancelled}</p>{reservation.status==="hold"&&<Button disabled={busy} onClick={()=>void action("retry")}>{copy.retryPayment}</Button>}{["hold","paid_unfulfilled","failed"].includes(reservation.status)&&<Button disabled={busy} variant="secondary" onClick={()=>void action("verify")}>{copy.checkPayment}</Button>}{error&&<ErrorState message={error}/>}</div>;
  return <div className="el-ticket-content">
    {qr?<TicketQr reservation={reservation}/>:<><div className="el-ticket-paper"><div className="el-ticket-photo">{reservation.image&&<img src={reservation.image} alt=""/>}</div><div className="el-ticket-stub"><h1>{reservation.title}</h1><dl><div><dt>{copy.dates}</dt><dd>{date(reservation.starts_at)}</dd></div><div><dt>{copy.time}</dt><dd>{clock(reservation.starts_at)}</dd></div><div><dt>{copy.venue}</dt><dd>{reservation.venue}</dd></div><div><dt>{copy.quantity}</dt><dd>{fa(reservation.quantity)}</dd></div></dl><TicketBarcode value={reservation.id}/></div></div><div className="el-ticket-buttons"><TicketDownloadButton reservationId={id}/><Button variant="secondary" onClick={()=>navigate(`/reservations/${id}/qr`)}><FigmaIcon screen={40} name="bx:qr"/>{copy.showCode}</Button></div></>}
    {!qr&&<><AppLink className="el-text-action" href={`/account/receipt?id=${encodeURIComponent(id)}`}>{copy.viewReceipt}</AppLink>{reservation.total===0&&reservation.starts_at>resource.data.serverNow&&<Button variant="secondary" disabled={busy} onClick={()=>setCancelling(true)}>{copy.cancelBooking}</Button>}{error&&<ErrorState message={error}/>}<ConfirmSheet open={cancelling} title={copy.cancelBookingConfirm} action={copy.cancelBooking} busy={busy} onClose={()=>setCancelling(false)} onConfirm={()=>void action("cancel").finally(()=>setCancelling(false))}/></>}
  </div>;
}
function TicketDownloadButton({ reservationId }: { reservationId: string }) {
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  return <div><Button disabled={busy} variant="secondary" onClick={async()=>{setBusy(true);setError("");try{const [data,module]=await Promise.all([api<TicketDownloadResponse>(`/api/reservations/${reservationId}/tickets`),import("@/lib/ticket-pdf")]);const blob=await module.createTicketPdf(data);const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=`hmghadam-${reservationId}.pdf`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}><FigmaIcon screen={40} name="frame"/>{copy.download}</Button>{error&&<p role="alert">{error}</p>}</div>;
}
function TicketQr({ reservation }: { reservation: Reservation }) {
  const resource=useResource<TicketDownloadResponse>(`/api/reservations/${reservation.id}/tickets`);const [selected,setSelected]=useState(0);const [code,setCode]=useState<{id:string;url:string}|null>(null);const [error,setError]=useState("");const [message,setMessage]=useState("");
  const ticket=resource.data?.tickets[selected];
  useEffect(()=>{if(!ticket)return;let active=true;void import("qrcode").then(module=>module.default.toDataURL(ticket.qr,{width:360,margin:4,errorCorrectionLevel:"M"})).then(url=>{if(active)setCode({id:ticket.id,url});}).catch((error:Error)=>{if(active)setError(error.message);});return()=>{active=false;};},[ticket]);
  if(resource.loading)return <LoadingState/>;
  if(resource.error)return <ErrorState message={resource.error} retry={resource.reload}/>;
  return <><div className="el-qr-card"><div className="el-qr-event">{reservation.image&&<img src={reservation.image} alt=""/>}<div><h1>{reservation.title}</h1><p><span><FigmaIcon screen={41} name="calendar"/>{date(reservation.starts_at)}</span><span><FigmaIcon screen={41} name="clock"/>{clock(reservation.starts_at)}</span></p></div></div><div className="el-qr-code">{ticket&&code?.id===ticket.id?<img src={code.url} width={180} height={180} alt={copy.entryCode}/>:<LoadingState/>}</div>{ticket?.checked_in_at&&<p className="el-muted">{copy.checkedIn}</p>}</div>{(resource.data?.tickets.length??0)>1&&<label className="el-field"><span>{copy.chooseTicket}</span><select value={selected} onChange={event=>setSelected(Number(event.target.value))}>{resource.data?.tickets.map((ticket,index)=><option key={ticket.id} value={index}>{copy.ticketNumber} {fa(ticket.ordinal)}</option>)}</select></label>}<p className="el-qr-hint"><FigmaIcon screen={41} name="lamp-on"/>{copy.scanInstruction}</p><div className="el-ticket-buttons">{ticket&&code?.id===ticket.id&&<><a className="el-button el-button-secondary" href={code.url} download={`hmghadam-qr-${selected+1}.png`}><FigmaIcon screen={41} name="frame"/>{copy.downloadCode}</a><Button variant="secondary" onClick={async()=>{setError("");setMessage("");try{const raw=atob(code.url.split(",")[1]);const bytes=Uint8Array.from(raw,char=>char.charCodeAt(0));const file=new File([bytes],`hmghadam-ticket-${ticket.ordinal}.png`,{type:"image/png"});if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:reservation.title});else{await navigator.clipboard.writeText(ticket.qr);setMessage(copy.codeCopied);}}catch(error){if(!(error instanceof DOMException&&error.name==="AbortError"))setError(copy.shareError);}}}><FigmaIcon screen={41} name="share"/>{copy.shareCode}</Button></>}</div>{message&&<p role="status">{message}</p>}{error&&<ErrorState message={error}/>}</>;
}
