"use client";
import { useEffect, useId, useRef, useState } from "react";
import { descriptionParagraphs } from "@/lib/event-description";
import { copy } from "@/locales/fa";

export function EventDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () => setOverflows(element.scrollHeight > Number.parseFloat(getComputedStyle(element).lineHeight) * 6 + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);
  return <section className="el-about-event">
    <h2>{copy.aboutEvent}</h2>
    <div ref={content} id={id} className={`el-description${expanded ? "" : " is-collapsed"}`}>
      {descriptionParagraphs(text).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </div>
    {overflows && <button type="button" className="el-text-action" aria-controls={id} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? copy.less : copy.more}</button>}
  </section>;
}
