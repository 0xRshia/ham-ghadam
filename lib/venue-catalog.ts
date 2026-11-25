import { distanceKm } from "./types";

export type VenueKind = "cafe" | "restaurant";
export type VenuePosition = { lat: number; lng: number };

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

export function hasVenueCoordinates<T extends Partial<VenuePosition>>(point: T): point is T & VenuePosition {
  return typeof point.lat === "number" && point.lat >= -90 && point.lat <= 90 &&
    typeof point.lng === "number" && point.lng >= -180 && point.lng <= 180;
}

export function getVenueDistanceKm(venue: Partial<VenuePosition>, origin?: VenuePosition | null): number | null {
  if (!origin || !hasVenueCoordinates(origin) || !hasVenueCoordinates(venue)) return null;
  return distanceKm(origin.lat, origin.lng, venue.lat, venue.lng);
}

const venueKilometers = new Intl.NumberFormat("fa-IR", { style: "unit", unit: "kilometer", unitDisplay: "long", maximumFractionDigits: 2 });

export function formatVenueDistance(kilometers: number): string {
  return venueKilometers.format(kilometers);
}
