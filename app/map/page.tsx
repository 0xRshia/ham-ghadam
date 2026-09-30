import { EventMap } from "@/components/evenline/event-map";
import { mapConfiguration } from "@/lib/map-configuration";
export default function Page() { return <EventMap configuration={mapConfiguration()}/>; }
