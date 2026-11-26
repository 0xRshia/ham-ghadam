"use client";

import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { Icon } from "@/components/icon";
import { topics, type Topic } from "@/lib/landing-content";

type Gesture = { id: number; x: number; y: number; dragging: boolean };

const wrapIndex = (index: number) => (index + topics.length) % topics.length;

export function topicHref(topic: Topic | "all") {
  return topic === "all" ? "/#experiences" : `/?topic=${topic}#experiences`;
}

export function plainClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function PosterWall({ initialTopic, onExplore }: {
  initialTopic: Topic | "all";
  onExplore: (topic: Topic) => void;
}) {
  const [{ active, previous }, setSelection] = useState(() => {
    const index = Math.max(0, topics.findIndex(topic => topic.id === initialTopic));
    return { active: index, previous: index };
  });
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const selected = topics[active];

  function select(index: number, focus = false) {
    const next = wrapIndex(index);
    setSelection({ active: next, previous: active });
    if (focus) links.current[next]?.focus({ preventScroll: true });
  }

  function onPosterKey(event: KeyboardEvent<HTMLAnchorElement>, index: number) {
    const destination = { ArrowLeft: index + 1, ArrowRight: index - 1, Home: 0, End: topics.length - 1 };
    if (!Object.hasOwn(destination, event.key)) return;
    event.preventDefault();
    select(destination[event.key as keyof typeof destination], true);
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick.current = false;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const x = event.clientX - current.x;
    const y = event.clientY - current.y;
    if (!current.dragging) {
      if (Math.abs(y) > 9 && Math.abs(y) > Math.abs(x)) {
        gesture.current = null;
        return;
      }
      if (Math.abs(x) < Math.max(7, 1.25 * Math.abs(y))) return;
      current.dragging = true;
      // Capture only horizontal drags so links and native vertical scrolling keep working.
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.classList.add("dragging");
    }
    const shift = Math.max(-75, Math.min(75, x * 0.38));
    event.currentTarget.style.setProperty("--drag-shift", `${shift}px`);
  }

  function resetDrag(event: PointerEvent<HTMLDivElement>) {
    gesture.current = null;
    event.currentTarget.classList.remove("dragging");
    event.currentTarget.style.removeProperty("--drag-shift");
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const distance = event.clientX - current.x;
    const threshold = Math.max(36, Math.min(75, event.currentTarget.clientWidth * 0.11));
    if (current.dragging) {
      suppressClick.current = true;
      if (Math.abs(distance) >= threshold) select(active + (distance > 0 ? 1 : -1));
    }
    resetDrag(event);
  }

  function getSlot(index: number, center: number) {
    const middle = Math.floor(topics.length / 2);
    return middle - wrapIndex(index - center + middle);
  }

  return <section className="poster-wall" aria-label="کشف با فندق">
    <div className="poster-stage" onPointerDown={startDrag} onPointerMove={moveDrag}
      onPointerUp={finishDrag} onPointerCancel={resetDrag}
      onLostPointerCapture={event => {
        // Touch starts captured by the poster and transfers to the stage on drag.
        if (event.target === event.currentTarget) resetDrag(event);
      }}
      onClickCapture={event => {
        if (event.detail === 0 || !suppressClick.current) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerLeave={event => { if (!gesture.current?.dragging) resetDrag(event); }}>
      <div className="fan-track" role="group" aria-label="موضوع پوسترها">
        {topics.map((topic, index) => {
          const slot = getSlot(index, active);
          const crossing = Math.abs(slot - getSlot(index, previous)) > Math.floor(topics.length / 2);
          return <a key={topic.id} ref={element => { links.current[index] = element; }}
            className={crossing ? "topic-poster wrap-slot" : "topic-poster"} data-slot={slot}
            href={topicHref(topic.id)} draggable={false} aria-current={index === active ? "true" : undefined}
            tabIndex={index === active ? 0 : -1}
            onClick={event => { if (plainClick(event)) { event.preventDefault(); select(index); } }}
            onKeyDown={event => onPosterKey(event, index)}>
            <span className="poster-paper">
              <span className="print-art"><img src={`/landing/topic-${topic.id}.webp`} width={960} height={384}
                alt="" draggable={false} fetchPriority={index === 0 ? "high" : "auto"} /></span>
              <span className="print-title">{topic.title}</span>
            </span>
          </a>;
        })}
      </div>
    </div>
    <div className="poster-controls wrap">
      <button type="button" className="flip flip-prev" aria-label="پوستر قبلی" onClick={() => select(active - 1)}>
        <Icon name="arrow-left" className="ico" />
      </button>
      <a className="landing-button primary poster-go" href={topicHref(selected.id)}
        onClick={event => { if (plainClick(event)) { event.preventDefault(); onExplore(selected.id); } }}>
        {selected.action}<Icon name="arrow-left" className="ico" />
      </a>
      <button type="button" className="flip" aria-label="پوستر بعدی" onClick={() => select(active + 1)}>
        <Icon name="arrow-left" className="ico" />
      </button>
    </div>
    <p className="sr-only" role="status">{selected.title}، پوستر {(active + 1).toLocaleString("fa-IR")} از {topics.length.toLocaleString("fa-IR")}</p>
  </section>;
}
