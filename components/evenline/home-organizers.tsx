"use client";

import { useResource } from "@/hooks/use-resource";
import { useFollowRefresh } from "@/hooks/use-follow-state";
import type { Organizer } from "@/lib/community-types";
import { copy } from "@/locales/fa";
import { OrganizerCard } from "./community";
import { ErrorState, LoadingState, SectionHeading } from "./primitives";

export function HomeOrganizers({ userId }: { userId?: string }) {
  const organizers = useResource<{ organizers: Organizer[] }>("/api/organizers");
  useFollowRefresh(organizers.reload);
  const available = organizers.data?.organizers.filter(organizer => organizer.id !== userId) ?? [];
  return <section className="el-search-section el-home-organizers" aria-labelledby="home-organizers-heading">
    <SectionHeading href="/following?view=discover"><span id="home-organizers-heading">{copy.whoToFollow}</span></SectionHeading>
    {organizers.loading ? <LoadingState /> : organizers.error ? <ErrorState message={organizers.error} retry={organizers.reload} /> : available.length ?
      <div className="el-collection-carousel" role="region" aria-label={copy.organizers} aria-roledescription={copy.carousel} tabIndex={0}>
        {available.map(organizer => <OrganizerCard key={organizer.id} organizer={organizer} />)}
      </div> : <p className="el-home-organizers-empty">{copy.noPublicOrganizers}</p>}
  </section>;
}
