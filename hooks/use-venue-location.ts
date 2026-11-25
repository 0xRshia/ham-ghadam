"use client";

import { useSyncExternalStore } from "react";
import { hasVenueCoordinates, type VenuePosition } from "@/lib/venue-catalog";

export type VenueLocationError = "denied" | "unavailable" | "timeout";
type LocationSnapshot = {
  origin: VenuePosition | null;
  locating: boolean;
  error: VenueLocationError | null;
};

const initial: LocationSnapshot = { origin: null, locating: false, error: null };
const listeners = new Set<() => void>();
let snapshot = initial;
let pending: Promise<VenuePosition | null> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function update(next: LocationSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => initial;

function requestLocation(): Promise<VenuePosition | null> {
  if (pending) return pending;
  const geolocation = globalThis.navigator?.geolocation;
  if (!geolocation) {
    update({ ...snapshot, error: "unavailable" });
    return Promise.resolve(null);
  }

  const position = new Promise<VenuePosition>((resolve, reject) => {
    geolocation.getCurrentPosition(reading => {
      const origin = { lat: reading.coords.latitude, lng: reading.coords.longitude };
      if (hasVenueCoordinates(origin)) resolve(origin);
      else reject(new Error("Geolocation returned invalid coordinates"));
    }, reject, { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false });
  });
  pending = position.then(reading => {
    const previous = snapshot.origin;
    const origin = previous?.lat === reading.lat && previous.lng === reading.lng ? previous : reading;
    pending = null;
    update({ origin, locating: false, error: null });
    return origin;
  }, (cause: unknown) => {
    const code = typeof cause === "object" && cause !== null && "code" in cause ? cause.code : null;
    const error = code === 1 ? "denied" : code === 3 ? "timeout" : "unavailable";
    pending = null;
    update({ ...snapshot, locating: false, error });
    return null;
  });
  update({ ...snapshot, locating: true, error: null });
  return pending;
}

export function useVenueLocation() {
  // Share only a location explicitly requested by the user during this page session.
  const location = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { ...location, requestLocation };
}
