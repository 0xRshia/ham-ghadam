import { EventMap } from "@/components/evenline/event-map";
import { mapConfiguration } from "@/lib/map-configuration";
export default async function Page({ searchParams }: { searchParams: Promise<{ intro?: string; layout?: string; layer?: string; venue?: string }> }) {
  const { intro, layout, layer, venue } = await searchParams;
  const places = intro !== "1" && layer === "places";
  const venueId = places && typeof venue === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(venue) ? venue : undefined;
  return <EventMap key={places ? `places:${venueId ?? ""}` : "events"} configuration={mapConfiguration()} introductory={intro === "1"}
    homeHref={layout === "v2" ? "/?layout=v2" : "/"} initialLayer={places ? "places" : "events"} initialVenueId={venueId} />;
}
