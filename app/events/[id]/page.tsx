import { mapConfiguration } from "@/lib/map-configuration";
import { EventDetail } from "@/components/evenline/event-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <EventDetail id={(await params).id} configuration={mapConfiguration()} />;
}
