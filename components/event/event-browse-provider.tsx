"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { defaultCatalogFilters, type CatalogFilters } from "@/lib/event-catalog";

type BrowseState = {
  filters: CatalogFilters;
  updateFilters: (changes: Partial<CatalogFilters>) => void;
  resetFilters: () => void;
};
const BrowseContext = createContext<BrowseState | null>(null);

export function EventBrowseProvider({ children }: { children: ReactNode }) {
  // Coordinates and browsing preferences live only for this mounted app session.
  const [filters, setFilters] = useState(defaultCatalogFilters);
  const updateFilters = useCallback((changes: Partial<CatalogFilters>) => {
    setFilters((current) => ({ ...current, ...changes }));
  }, []);
  const resetFilters = useCallback(() => setFilters(defaultCatalogFilters), []);
  const value = useMemo(() => ({ filters, updateFilters, resetFilters }), [filters, updateFilters, resetFilters]);
  return <BrowseContext.Provider value={value}>{children}</BrowseContext.Provider>;
}

export function useEventBrowse() {
  const context = useContext(BrowseContext);
  if (!context) throw new Error("Event browsing requires EventBrowseProvider.");
  return context;
}
