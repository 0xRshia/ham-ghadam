import type { Metadata } from "next";
import { VenueDetail } from "@/components/evenline/venue-detail";
import { copy } from "@/locales/fa";

export const metadata: Metadata = { title: copy.venueDetails };

export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  const venueId = /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : undefined;
  return <VenueDetail id={venueId} fromMap={from === "map"} />;
}
