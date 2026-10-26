"use client";
import { useState } from "react";
import { AppLink, useAppNavigate } from "@/components/event/app-navigation";
import { AccountGate } from "@/components/evenline/community";
import { Header, LoadingState, ErrorState } from "@/components/evenline/primitives";
import { useResource } from "@/hooks/use-resource";
import { api } from "@/lib/client";
import { fa, type EventItem } from "@/lib/types";
import { scheduleDateLabel, scheduleTimeLabel } from "@/lib/event-schedule";
import type { OrganizerContractValues } from "@/lib/organizer-contract-fields";
import { OrganizerAgreementFields, organizerAgreementFromForm } from "./organizer-agreement-fields";
import styles from "./legal.module.css";

type ContractData = { event: EventItem & { revision: number }; previous: { fields: OrganizerContractValues } | null };
export function OrganizerAgreementPage({ id }: { id: string }) {
  return <main><Header title="قرارداد و انتشار رویداد" back="/host" /><AccountGate><AgreementContent id={id} /></AccountGate></main>;
}
function AgreementContent({ id }: { id: string }) {
  const endpoint = `/api/host/events/${encodeURIComponent(id)}/agreement`;
  const resource = useResource<ContractData>(endpoint);
  if (resource.loading) return <LoadingState />;
  if (!resource.data) return <ErrorState message={resource.error} retry={resource.reload} />;
  return <AgreementForm key={resource.data.event.revision} data={resource.data} endpoint={endpoint} />;
}
function AgreementForm({ data, endpoint }: { data: ContractData; endpoint: string }) {
  const [busy,setBusy]=useState(false), [error,setError]=useState("");
  const navigate=useAppNavigate();
  return <form className={styles.document} dir="rtl" aria-busy={busy} onSubmit={async event => {
    event.preventDefault(); if(busy)return;
    const form = new FormData(event.currentTarget);setBusy(true);setError("");
    try { await api(endpoint,{revision:data.event.revision,organizerAgreement:organizerAgreementFromForm(form)});navigate("/host"); }
    catch(error){setError((error as Error).message);}finally{setBusy(false);}
  }}>
    <div className={styles.review}><h1>{data.event.title}</h1><p>{scheduleDateLabel(data.event, true)} · {scheduleTimeLabel(data.event)}<br />{data.event.venue} · {data.event.city}<br />{data.event.address}<br />ظرفیت: {data.event.capacity === null ? "اعلام نشده" : fa(data.event.capacity)}</p><p className={styles.note}>این مشخصات همراه با نسخه قرارداد و زمان پذیرش ثبت می‌شوند. انتشار از پنل برگزارکننده به تکمیل اطلاعات زیر نیاز دارد.</p></div>
    <OrganizerAgreementFields disabled={busy} initial={data.previous?.fields} />
    {error && <ErrorState message={error} />}
    <button className="button" disabled={busy}>{busy ? "در حال ثبت…" : "ثبت پذیرش و انتشار رویداد"}</button>{" "}<AppLink href="/host">بازگشت به پنل</AppLink>
  </form>;
}
