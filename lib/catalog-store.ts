import type { EventCatalog } from "./types";

export const CATALOG_MAX_AGE = 60_000;
type Snapshot = { catalog: EventCatalog | null; error: string; updatedAt: number };
const empty: Snapshot = { catalog: null, error: "", updatedAt: 0 };

/** One browser-session cache; never persist personalized results or fetch during SSR. */
export function createCatalogStore(fetchCatalog: () => Promise<EventCatalog>, now = Date.now) {
  let snapshot = empty;
  let generation = 0;
  let pending: Promise<void> | null = null;
  let viewer: string | null | undefined;
  const listeners = new Set<() => void>();
  function publish(next: Snapshot) { snapshot = next; listeners.forEach(listener => listener()); }
  function invalidate() {
    generation++;
    pending = null;
    viewer = undefined;
    publish(empty);
  }
  function identify(next: string | null | undefined) {
    if (next === undefined) return;
    if ((viewer !== undefined && viewer !== next) || (snapshot.catalog && snapshot.catalog.viewerId !== next)) invalidate();
    viewer = next;
  }
  function refresh(force = false) {
    if (pending) return pending;
    if (!force && snapshot.catalog && now() - snapshot.updatedAt < CATALOG_MAX_AGE) return Promise.resolve();
    const requestGeneration = generation;
    pending = fetchCatalog().then(catalog => {
      if (requestGeneration !== generation) return;
      // A session may expire or change while either initial request is in flight.
      if (viewer !== undefined && catalog.viewerId !== viewer) {
        publish({ catalog: null, error: "نشست تغییر کرده است؛ صفحه را دوباره بارگیری کنید.", updatedAt: 0 });
        return;
      }
      publish({ catalog, error: "", updatedAt: now() });
    }, (error: Error) => {
      if (requestGeneration === generation) publish({ ...snapshot, error: error.message });
    }).finally(() => { if (requestGeneration === generation) pending = null; });
    return pending;
  }
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => empty,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    identify, invalidate, refresh,
  };
}
