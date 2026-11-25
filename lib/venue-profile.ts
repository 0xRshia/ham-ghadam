import catalog from "../public/data/venues.json" with { type: "json" };
import details from "../public/data/venue-profiles.json" with { type: "json" };
import type { Venue, VenueCatalog } from "./venue-catalog";

export type VenueProfile = Venue & {
  photos?: string[];
  metro?: { name: string; lines: number[] };
};

// This module is used by the server page only. A deep link sends one venue to the browser.
const byId = new Map((catalog as VenueCatalog).venues.map(venue => [venue.id, venue]));
const extras: Record<string, Pick<VenueProfile, "photos" | "metro">> =
  catalog.asOf === details.asOf ? details.profiles : {};

export function getVenueProfile(id: string): VenueProfile | null {
  const venue = byId.get(id);
  return venue ? { ...venue, ...extras[id] } : null;
}
