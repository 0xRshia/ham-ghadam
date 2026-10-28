"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DeferredLoading } from "./deferred-loading";

/** Keep mounted after first reveal so scrolling never discards an editor draft. */
export function WhenVisible({ children, minHeight = 280 }: { children: ReactNode; minHeight?: number }) {
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "150px" });
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={element} style={{ minHeight }}>{visible ? children : <DeferredLoading />}</div>;
}
