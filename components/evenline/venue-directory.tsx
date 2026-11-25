"use client";

import { useMemo, useState } from "react";
import { AppLink } from "@/components/event/app-navigation";
import { useResource } from "@/hooks/use-resource";
import { VENUE_CATALOG_URL, type Venue, type VenueCatalog } from "@/lib/venue-catalog";
import { countVenueFilters, filterVenues, INITIAL_VENUE_FILTERS } from "@/lib/venue-filters";
import { fa } from "@/lib/types";
import { copy } from "@/locales/fa";
import { ErrorState, LoadingState } from "./primitives";
import { VenueFilters } from "./venue-filters";
import { VenueResults } from "./venue-results";

const noVenues: Venue[] = [];

export function VenueDirectory() {
  const { data, error, loading, reload } = useResource<VenueCatalog>(VENUE_CATALOG_URL);
  const [filters, setFilters] = useState(INITIAL_VENUE_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const venues = data?.venues ?? noVenues;
  const results = useMemo(() => filterVenues(venues, filters), [venues, filters]);
  const activeCount = countVenueFilters(filters);

  return <section className="el-venue-directory" aria-labelledby="venue-results-heading">
    <div className="el-venue-directory-heading">
      <h2 id="venue-results-heading">{copy.venueResults}{data && <> <span aria-live="polite">({fa(results.length)})</span></>}</h2>
      <div className="el-venue-directory-actions">
        <AppLink href="/map?layer=places" className="el-text-action">{copy.venueOpenMap}</AppLink>
        {data && <button type="button" className="el-text-action" aria-expanded={filtersOpen} aria-controls="directory-venue-filters"
          onClick={() => setFiltersOpen(open => !open)}>{copy.filters}{activeCount > 0 && ` (${fa(activeCount)})`}</button>}
      </div>
    </div>
    {error ? <ErrorState message={error} retry={reload} /> : loading ? <LoadingState /> : <>
      <div id="directory-venue-filters" hidden={!filtersOpen}>
        <VenueFilters filters={filters} onChange={setFilters} onApply={() => setFiltersOpen(false)} />
      </div>
      {results.length ? <VenueResults key={JSON.stringify(filters)} venues={results} /> : <p className="el-status">{copy.noMatchingVenues}</p>}
    </>}
  </section>;
}
