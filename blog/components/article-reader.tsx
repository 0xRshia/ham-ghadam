"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icon";

type Section = { id: string; label: string };

export function ArticleReader({ sections, children }: { sections: Section[]; children: ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  const index = useRef<HTMLDetailsElement>(null);
  const [current, setCurrent] = useState("");

  useEffect(() => {
    const text = body.current;
    const header = text?.closest(".reading-page")?.querySelector(".landing-header");
    const progress = header?.querySelector<HTMLElement>(".reading-progress");
    if (!text || !header || !progress) return;

    const desktop = matchMedia("(min-width: 821px)");
    const headings = Array.from(text.querySelectorAll<HTMLElement>("h2[id]"));
    let frame = 0;

    const update = () => {
      frame = 0;
      const end = window.scrollY + text.getBoundingClientRect().bottom - document.documentElement.clientHeight;
      const fraction = Math.min(1, Math.max(0, window.scrollY / Math.max(1, end)));
      progress.style.transform = `scaleX(${fraction})`;
      const landmark = header.getBoundingClientRect().bottom + 48;
      setCurrent(headings.findLast(heading => heading.getBoundingClientRect().top <= landmark)?.id ?? "");
    };
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    function resizeIndex() {
      if (index.current) index.current.open = desktop.matches;
      schedule();
    }
    resizeIndex();
    const observer = new ResizeObserver(() => {
      text.style.setProperty("--reader-header-height", `${header.getBoundingClientRect().height}px`);
      schedule();
    });
    observer.observe(document.body);
    observer.observe(header);
    desktop.addEventListener("change", resizeIndex);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      desktop.removeEventListener("change", resizeIndex);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      progress.style.transform = "";
    };
  }, [sections]);

  return <div className="wrap reading-layout">
    {sections.length > 0 && <aside className="reading-rail">
      <details className="reading-index" ref={index}>
        <summary><Icon name="list" className="index-icon" /><span>در این نوشته</span><Icon name="chevron-left" className="index-chevron" /></summary>
        <nav aria-label="فهرست بخش‌های مقاله"><ul>
          {sections.map(({ id, label }) => <li key={id}><a href={`#${id}`} aria-current={current === id ? "location" : undefined}
            onClick={event => {
              if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !index.current || matchMedia("(min-width: 821px)").matches) return;
              index.current.open = false;
              document.getElementById(id)?.focus({ preventScroll: true });
            }}>{label}</a></li>)}
        </ul></nav>
      </details>
    </aside>}
    <div className="reader-body" ref={body}>{children}</div>
  </div>;
}
