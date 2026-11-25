import { digits } from "./types";
import { getVenueDistanceKm, hasVenueCoordinates, type Venue, type VenuePosition } from "./venue-catalog";

export const VENUE_AMENITIES = [
  "cozy",
  "outdoor_space_available",
  "good_for_work_or_study",
  "smoke_allowed",
  "good_for_groups",
  "spacious",
  "good_for_board_games",
  "good_for_photography",
  "power_outlets_available",
  "parking_difficult",
] as const;

export type VenueAmenity = (typeof VENUE_AMENITIES)[number];
export type VenueFilterState = {
  query: string;
  kind: "all" | Venue["kinds"][number];
  amenities: VenueAmenity[];
  priceLevel: number | null;
  sort: "recommended" | "distance" | "price" | "name";
};

export const INITIAL_VENUE_FILTERS: VenueFilterState = {
  query: "",
  kind: "all",
  amenities: [],
  priceLevel: null,
  sort: "recommended",
};

export function countVenueFilters(filters: VenueFilterState) {
  return Number(Boolean(filters.query.trim())) + Number(filters.kind !== "all") +
    filters.amenities.length + Number(filters.priceLevel !== null) +
    Number(filters.sort !== "recommended");
}

const nameCollator = new Intl.Collator("fa", { numeric: true });

function normalizeSearch(value: string) {
  return digits(value.toLowerCase().normalize("NFKC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u064b-\u065f\u0670\u200c\u200d\s]/g, ""));
}

export function filterVenues<T extends Venue>(venues: readonly T[], filters: VenueFilterState, position?: VenuePosition | null) {
  const { kind, priceLevel, amenities, sort } = filters;
  const query = normalizeSearch(filters.query);
  const matches = venues.filter(venue =>
    (kind === "all" || venue.kinds.includes(kind)) &&
    (priceLevel === null || venue.priceLevel === priceLevel) &&
    amenities.every(amenity => venue.tags?.includes(amenity)) &&
    (!query || normalizeSearch(`${venue.name} ${venue.address ?? ""}`).includes(query)),
  );

  if (sort === "recommended") return matches;
  const byName = (a: T, b: T) => nameCollator.compare(a.name, b.name);
  if (sort === "name") return matches.sort(byName);
  if (sort === "price") {
    return matches.sort((a, b) => (a.priceLevel ?? Infinity) - (b.priceLevel ?? Infinity) || byName(a, b));
  }

  if (!position || !hasVenueCoordinates(position)) return matches;
  const ranked = matches.map(venue => ({
    venue,
    distance: getVenueDistanceKm(venue, position) ?? Infinity,
  }));
  return ranked.sort((a, b) => a.distance - b.distance || byName(a.venue, b.venue)).map(entry => entry.venue);
}
