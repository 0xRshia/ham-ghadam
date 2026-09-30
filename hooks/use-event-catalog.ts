"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/event/auth-context";
import { api } from "@/lib/client";
import type { EventCatalog } from "@/lib/types";

export function useEventCatalog() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<{
    catalog: EventCatalog | null;
    error: string;
    userId: string | null;
  }>({ catalog: null, error: "", userId });
  const [request, setRequest] = useState(0);
  const version = useRef(0);
  const reload = useCallback(() => {
    // Ignore the previous request as soon as retry or a restored page requests new data.
    version.current++;
    setState({ catalog: null, error: "", userId });
    setRequest((value) => value + 1);
  }, [userId]);

  useEffect(() => {
    if (authLoading) return;
    const currentVersion = ++version.current;
    let active = true;
    void api<EventCatalog>("/api/events").then(
      (catalog) => {
        if (active && currentVersion === version.current) setState({ catalog, error: "", userId });
      },
      (error: Error) => {
        if (active && currentVersion === version.current) setState({ catalog: null, error: error.message, userId });
      },
    );
    return () => { active = false; };
  }, [authLoading, userId, request]);

  useEffect(() => {
    const restore = (event: PageTransitionEvent) => { if (event.persisted) reload(); };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, [reload]);

  const current = !authLoading && state.userId === userId;
  return {
    catalog: current ? state.catalog : null,
    loading: !current || (!state.catalog && !state.error),
    error: current ? state.error : "",
    reload,
  };
}
