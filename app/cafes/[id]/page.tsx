import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VenueDetail } from "@/components/evenline/venue-detail";
import { mapConfiguration } from "@/lib/map-configuration";
import { getVenueProfile } from "@/lib/venue-profile";
import { copy } from "@/locales/fa";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const venue = getVenueProfile((await params).id);
  return { title: venue?.name ?? copy.venueDetails, description: venue?.address };
}

export default async function Page({ params, searchParams }: Props) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  const venue = getVenueProfile(id);
  if (!venue) notFound();
  return <VenueDetail key={id} venue={venue} fromMap={from === "map"} configuration={mapConfiguration()} />;
}
