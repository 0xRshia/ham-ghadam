export type VenueKind = "cafe" | "restaurant";

export type Venue = {
  id: string;
  name: string;
  kinds: VenueKind[];
  address?: string;
  lat?: number;
  lng?: number;
  tags?: string[];
  priceLevel?: number;
  url?: string;
  menuUrl?: string;
  image?: string;
};

export type VenueCatalog = { asOf: string; venues: Venue[] };

export const VENUE_CATALOG_URL = "/data/venues.json";

export function hasVenueCoordinates(venue: Venue): venue is Venue & { lat: number; lng: number } {
  return typeof venue.lat === "number" && venue.lat >= -90 && venue.lat <= 90 &&
    typeof venue.lng === "number" && venue.lng >= -180 && venue.lng <= 180;
}
