"use client";

import { ChevronDown, LocateFixed, Map, Search, SlidersHorizontal } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { AppLink } from "@/components/event/app-navigation";
import { useResource } from "@/hooks/use-resource";
import { useVenueLocation } from "@/hooks/use-venue-location";
import { VENUE_CATALOG_URL, type Venue, type VenueCatalog } from "@/lib/venue-catalog";
import { filterVenues, INITIAL_VENUE_FILTERS, type VenueFilterState } from "@/lib/venue-filters";
import { fa } from "@/lib/types";
import { copy, venueFilterCopy as labels } from "@/locales/fa";
import { ErrorState, LoadingState } from "./primitives";
import { VenueFilters } from "./venue-filters";
import { VenueResults } from "./venue-results";

const noVenues: Venue[] = [];

export function VenueDirectory() {
  const { data, error, loading, reload } = useResource<VenueCatalog>(VENUE_CATALOG_URL);
  const [filters, setFilters] = useState(INITIAL_VENUE_FILTERS);
  const deferredFilters = useDeferredValue(filters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { origin, locating, error: locationError, requestLocation } = useVenueLocation();
  const venues = data?.venues ?? noVenues;
  const results = useMemo(() => filterVenues(venues, deferredFilters, origin), [venues, deferredFilters, origin]);
  const activeCount = Number(filters.kind !== "all") + Number(filters.priceLevel !== null) + filters.amenities.length;

  return <section className="el-venue-directory" aria-labelledby="venue-results-heading">
    {data && <div className="el-venue-directory-controls">
      <div className="el-search el-venue-search" role="search" aria-label={labels.search}>
        <Search size={20} aria-hidden="true" />
        <input type="search" aria-label={labels.search} placeholder={labels.searchPlaceholder} value={filters.query}
          onChange={event => setFilters({ ...filters, query: event.target.value })} />
      </div>
      <div className="el-venue-toolbar">
        <button type="button" className="el-venue-tool" aria-expanded={filtersOpen} aria-controls="directory-venue-filters"
          data-active={activeCount > 0} onClick={() => setFiltersOpen(open => !open)}>
          <SlidersHorizontal size={15} aria-hidden="true" />{copy.filters}{activeCount > 0 && <span>({fa(activeCount)})</span>}
        </button>
        <label className="el-venue-tool el-venue-sort" data-active={filters.sort !== "recommended"}>
          <select aria-label={labels.sortLabel} value={filters.sort}
            onChange={event => setFilters({ ...filters, sort: event.target.value as VenueFilterState["sort"] })}>
            <option value="recommended">{labels.sortLabel}</option>
            <option value="name">{labels.sort.name}</option>
            {origin && <option value="distance">{labels.sort.distance}</option>}
            <option value="price">{labels.sort.price}</option>
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
        <button type="button" className="el-venue-tool" data-active={!!origin} disabled={locating} aria-busy={locating}
          onClick={requestLocation}>
          <LocateFixed size={15} aria-hidden="true" />{locating ? copy.mapLocating : copy.locationShort}
        </button>
        <AppLink href="/map?layer=places" aria-label={copy.venueOpenMap} className="el-venue-tool">
          <Map size={15} aria-hidden="true" />{copy.mapTab}
        </AppLink>
      </div>
      {locationError && <p className="el-venue-location-status" role="status">
        {locationError === "timeout" ? copy.venueLocationTimeout : copy.venueLocationUnavailable}
      </p>}
      <div id="directory-venue-filters" hidden={!filtersOpen}>
        <VenueFilters filters={filters} onChange={setFilters} facetsOnly onApply={() => setFiltersOpen(false)} />
      </div>
    </div>}
    <div className="el-venue-directory-heading">
      <h2 id="venue-results-heading">{copy.venueResults}</h2>
      {data && <span aria-live="polite">{fa(results.length)} مکان</span>}
    </div>
    {error ? <ErrorState message={error} retry={reload} /> : loading ? <LoadingState /> : results.length
      ? <VenueResults key={JSON.stringify(deferredFilters)} venues={results} origin={origin} />
      : <p className="el-status">{copy.noMatchingVenues}</p>}
  </section>;
}
