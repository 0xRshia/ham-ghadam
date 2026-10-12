"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { defaultCatalogFilters, type CatalogFilters } from "@/lib/event-catalog";
import { mapIntroductionKey, readMapIntroduction, saveMapIntroduction } from "@/lib/map-introduction";

type BrowseState = {
  filters: CatalogFilters;
  updateFilters: (changes: Partial<CatalogFilters>) => void;
  resetFilters: () => void;
  mapIntroductionCompleted: boolean | null;
  completeMapIntroduction: () => void;
};
const BrowseContext = createContext<BrowseState | null>(null);

function subscribeToStorage(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === mapIntroductionKey || event.key === null) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
const serverMapIntroduction = () => null;

export function EventBrowseProvider({ children }: { children: ReactNode }) {
  // Coordinates and browsing preferences live only for this mounted app session.
  const [filters, setFilters] = useState(defaultCatalogFilters);
  const [completedInSession, setCompletedInSession] = useState(false);
  const persistedCompletion = useSyncExternalStore(subscribeToStorage, readMapIntroduction, serverMapIntroduction);
  const mapIntroductionCompleted = completedInSession || persistedCompletion;
  const completeMapIntroduction = useCallback(() => {
    // Preserve completion for this session even if browser storage is blocked.
    setCompletedInSession(true);
    saveMapIntroduction();
  }, []);
  const updateFilters = useCallback((changes: Partial<CatalogFilters>) => {
    setFilters((current) => ({ ...current, ...changes }));
  }, []);
  const resetFilters = useCallback(() => setFilters(defaultCatalogFilters), []);
  const value = useMemo(() => ({ filters, updateFilters, resetFilters, mapIntroductionCompleted, completeMapIntroduction }),
    [filters, updateFilters, resetFilters, mapIntroductionCompleted, completeMapIntroduction]);
  return <BrowseContext.Provider value={value}>{children}</BrowseContext.Provider>;
}

export function useEventBrowse() {
  const context = useContext(BrowseContext);
  if (!context) throw new Error("Event browsing requires EventBrowseProvider.");
  return context;
}
