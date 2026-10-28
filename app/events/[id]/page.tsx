import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { mapConfiguration } from "@/lib/map-configuration";
import { publicEvent } from "@/lib/public-event";
import { ApiError } from "@/lib/server";
import { EventDetail } from "@/components/evenline/event-detail";

export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const req = new Request("http://localhost", { headers: await headers() });
  const event = await publicEvent(id, req).catch(error => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  return <EventDetail key={id} id={id} initialEvent={event} configuration={mapConfiguration()} />;
}
