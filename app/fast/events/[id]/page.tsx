import { notFound } from "next/navigation";
import { requireFastPage } from "@/lib/fast-page-auth";
import { fastEvent, fastOrganizers } from "@/lib/fast-events";
import { ApiError } from "@/lib/server";
import { FastShell } from "@/components/fast/shell";
import { FastEventEditor } from "@/components/fast/event-editor";
import { SheetEventEditor } from "@/components/fast/sheet-event-editor";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireFastPage();
  const { id } = await params;
  const [event, organizers] = await Promise.all([fastEvent(id).catch(error => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; }), fastOrganizers()]);
  return <FastShell>{event.sheet_managed ? <SheetEventEditor key={event.id} initial={event} /> : <FastEventEditor key={event.id} initial={event} organizers={organizers} />}</FastShell>;
}
