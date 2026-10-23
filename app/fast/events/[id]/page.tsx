import { notFound } from "next/navigation";
import { requireFastPage } from "@/lib/fast-page-auth";
import { fastEvent, fastOrganizers } from "@/lib/fast-events";
import { ApiError } from "@/lib/server";
import { FastShell } from "@/components/fast/shell";
import { FastEventEditor } from "@/components/fast/event-editor";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireFastPage();
  const { id } = await params;
  const event = await fastEvent(id).catch(error => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; });
  return <FastShell><FastEventEditor key={event.id} initial={event} organizers={await fastOrganizers()} /></FastShell>;
}
