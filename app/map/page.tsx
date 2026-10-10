import { EventMap } from "@/components/evenline/event-map";
import { mapConfiguration } from "@/lib/map-configuration";
export default async function Page({ searchParams }: { searchParams: Promise<{ intro?: string; layout?: string }> }) {
  const { intro, layout } = await searchParams;
  return <EventMap configuration={mapConfiguration()} introductory={intro === "1"} homeHref={layout === "v2" ? "/?layout=v2" : "/"} />;
}
