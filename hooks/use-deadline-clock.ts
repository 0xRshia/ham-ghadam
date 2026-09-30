"use client";

import { useEffect, useState } from "react";
import { registrationClockDelay } from "@/lib/registration";
import { serverClockAnchor, serverClockTime } from "@/lib/server-clock";

export function useDeadlineClock(deadline: number | undefined, refreshIntervalMs = 60000, serverNow?: number) {
  // Server and hydration render agree; the first timer supplies the browser clock.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const observedAt = Date.now();
    const anchor = serverNow === undefined ? observedAt : serverClockAnchor(serverNow, observedAt);
    function tick() {
      const localNow = Date.now();
      const current = serverNow === undefined ? localNow : serverClockTime(serverNow, anchor, localNow);
      setNow(current);
      timer = setTimeout(tick, registrationClockDelay(deadline, current, refreshIntervalMs));
    }
    timer = setTimeout(tick, 0);
    function resume() {
      clearTimeout(timer);
      tick();
    }
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [deadline, refreshIntervalMs, serverNow]);
  return now;
}
