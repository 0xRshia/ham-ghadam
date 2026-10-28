"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/components/event/auth-context";
import { api } from "@/lib/client";
import type { EventCatalog } from "@/lib/types";
import { createCatalogStore, CATALOG_MAX_AGE } from "@/lib/catalog-store";
import { serverClockAnchor } from "@/lib/server-clock";

const store = createCatalogStore(async () => {
  const catalog = await api<EventCatalog>("/api/events");
  if (catalog.serverNow !== undefined) serverClockAnchor(catalog.serverNow, Date.now());
  return catalog;
});
export const invalidateEventCatalog = store.invalidate;

export function useEventCatalog() {
  const { user, loading: authLoading, loggingOut } = useAuth();
  const userId = user?.id ?? null;
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const reload = useCallback(() => { void store.refresh(true); }, []);
  useEffect(() => {
    if (loggingOut) return;
    store.identify(authLoading ? undefined : userId);
    void store.refresh();
    const refresh = () => { if (document.visibilityState === "visible") void store.refresh(); };
    const restore = (event: PageTransitionEvent) => { if (event.persisted) reload(); };
    const interval = window.setInterval(refresh, CATALOG_MAX_AGE);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pageshow", restore);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pageshow", restore);
    };
  }, [authLoading, userId, loggingOut, reload]);
  const current = !authLoading && !loggingOut && (!state.catalog || state.catalog.viewerId === userId);
  return {
    catalog: current ? state.catalog : null,
    loading: !current || (!state.catalog && !state.error),
    error: current && !state.catalog ? state.error : "",
    refreshError: current && state.catalog ? state.error : "",
    reload,
  };
}
