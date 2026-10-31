"use client";
import { useEffect, useState } from "react";
import type { EventCatalog } from "@/lib/types";
import { serverClockAnchor, serverClockTime } from "@/lib/server-clock";
import { nextManualSession, tehranDay } from "@/lib/event-schedule";

export function useCatalogClock(catalog: EventCatalog | null) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const observed = Date.now();
    const serverNow = catalog?.serverNow ?? observed;
    const anchor = serverClockAnchor(serverNow, observed);
    function tick() {
      const current = serverClockTime(serverNow, anchor, Date.now());
      setNow(current);
      const boundaries = (catalog?.events ?? []).flatMap(event => {
        const slot = event.schedule?.source === "manual" ? nextManualSession(event.schedule, current) : null;
        return [event.starts_at, event.ends_at, event.registration_ends_at, slot?.start ?? null, slot?.end ?? null];
      });
      boundaries.push(tehranDay(current) + 86400000);
      const next = boundaries.reduce<number>((next, value) => value !== null && value > current ? Math.min(next, value) : next, current + 60000);
      if (document.visibilityState === "visible") timer = setTimeout(tick, Math.max(1, next - current));
    }
    function resume() { clearTimeout(timer); if (document.visibilityState === "visible") tick(); }
    timer = setTimeout(tick, 0);
    document.addEventListener("visibilitychange", resume);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", resume); };
  }, [catalog]);
  return now;
}
