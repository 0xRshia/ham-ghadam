"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { defaultCatalogFilters, type CatalogFilters } from "@/lib/event-catalog";

type BrowseState = {
  filters: CatalogFilters;
  updateFilters: (changes: Partial<CatalogFilters>) => void;
  resetFilters: () => void;
  mapIntroductionCompleted: boolean | null;
  completeMapIntroduction: () => void;
};
const BrowseContext = createContext<BrowseState | null>(null);
const mapIntroductionKey = "hg_map_introduction_completed";

function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}
function readMapIntroduction() {
  try { return window.localStorage.getItem(mapIntroductionKey) === "1"; }
  catch { return false; }
}
const serverMapIntroduction = () => null;

export function EventBrowseProvider({ children }: { children: ReactNode }) {
  // Coordinates and browsing preferences live only for this mounted app session.
  const [filters, setFilters] = useState(defaultCatalogFilters);
  const [completedInSession, setCompletedInSession] = useState(false);
  const persistedCompletion = useSyncExternalStore(subscribeToStorage, readMapIntroduction, serverMapIntroduction);
  const mapIntroductionCompleted = completedInSession || persistedCompletion;
  const completeMapIntroduction = useCallback(() => {
    setCompletedInSession(true);
    try { window.localStorage.setItem(mapIntroductionKey, "1"); }
    catch { /* The in-memory completion prevents loops when storage is unavailable. */ }
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
