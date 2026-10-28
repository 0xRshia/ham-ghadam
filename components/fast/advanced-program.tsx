"use client";
import { ProgramForm } from "@/components/evenline/program-editor";
import { useResource } from "@/hooks/use-resource";
import type { FastEvent } from "@/lib/fast-types";
import { fastCopy as t } from "@/locales/fast-fa";
import styles from "./fast.module.css";
export default function AdvancedProgram({ event }: { event: FastEvent }) {
  const series = useResource<{ series: { id: string; title: string }[] }>(event.host_id ? `/api/fast/event-series?host_id=${encodeURIComponent(event.host_id)}` : null);
  return <>
    {!event.host_id && <p className={styles.muted}>{t.organizerSeriesUnavailable}</p>}
    {series.loading ? <p role="status">{t.loading}</p> : series.error ? <div role="alert">{series.error}<button type="button" onClick={series.reload}>{t.retry}</button></div> : event.program && (!event.host_id || series.data) &&
      <ProgramForm event={event} initial={event.program} initialSeries={series.data?.series ?? []} endpoint={`/api/fast/events/${event.id}/program`} seriesEndpoint="/api/fast/event-series" seriesHostId={event.host_id ?? undefined} allowSeries={!!event.host_id} />}
  </>;
}
