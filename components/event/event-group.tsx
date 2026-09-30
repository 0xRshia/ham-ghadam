"use client";

import { faContent, faMessages } from "@/locales/domain-fa";
import { useCallback, useId, useSyncExternalStore } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { AppLink } from "./app-navigation";
import { EventCard } from "./event-card";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { EVENT_PREVIEW_LIMIT, type CatalogEntry } from "@/lib/event-catalog";
import { fa } from "@/lib/types";
import styles from "./event-group.module.css";

export function EventGroup({
  heading, items, href, variant = "neutral", priority = false, serverNow,
}: {
  heading: string;
  items: CatalogEntry[];
  href: string;
  variant?: "neutral" | "primary";
  priority?: boolean;
  serverNow?: number;
}) {
  const headingId = useId();
  const trackId = useId();
  const reducedMotion = useReducedMotion();
  const preview = items.slice(0, EVENT_PREVIEW_LIMIT);
  const [viewportRef, carousel] = useEmblaCarousel({
    // Keep the last, shorter group at inline-start without repeating earlier cards.
    direction: "rtl", loop: false, align: "start", containScroll: false,
    slidesToScroll: 1, skipSnaps: false,
    breakpoints: {
      "(min-width: 601px)": { slidesToScroll: 2 },
      "(min-width: 901px)": { slidesToScroll: 3 },
    },
    duration: reducedMotion ? 0 : 20,
  });
  const subscribe = useCallback((callback: () => void) => {
    if (!carousel) return () => {};
    carousel.on("select", callback).on("reInit", callback);
    return () => { carousel.off("select", callback).off("reInit", callback); };
  }, [carousel]);
  const previous = useSyncExternalStore(subscribe, () => carousel?.canScrollPrev() ?? false, () => false);
  const next = useSyncExternalStore(subscribe, () => carousel?.canScrollNext() ?? false, () => false);
  if (!preview.length) return null;

  return (
    <section className={`${styles.group} ${variant === "primary" ? styles.primary : ""}`}
      aria-labelledby={headingId} aria-roledescription={faContent.horizontalEvents} dir="rtl">
      <div data-motion-item className={styles.heading}>
        <h2 id={headingId}>{heading}</h2>
        <div className={styles.controls}>
          <button type="button" className={styles.arrow} aria-label={faMessages.previousSection(String(heading))}
            aria-controls={trackId} disabled={!previous} onClick={() => carousel?.scrollPrev(reducedMotion)}>
            <ArrowRight size={20} aria-hidden="true" />
          </button>
          <button type="button" className={styles.arrow} aria-label={faMessages.nextSection(String(heading))}
            aria-controls={trackId} disabled={!next} onClick={() => carousel?.scrollNext(reducedMotion)}>
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div ref={viewportRef} className={styles.viewport} tabIndex={0}
        aria-label={faMessages.carouselInstructions(String(heading))}
        onKeyDown={(event) => {
          if (!carousel) return;
          if (event.key === "ArrowLeft") carousel.scrollNext(reducedMotion);
          else if (event.key === "ArrowRight") carousel.scrollPrev(reducedMotion);
          else if (event.key === "Home") carousel.scrollTo(0, reducedMotion);
          else if (event.key === "End") carousel.scrollTo(carousel.scrollSnapList().length - 1, reducedMotion);
          else return;
          event.preventDefault();
        }}>
        <div className={styles.track} id={trackId}>
          {preview.map(({ event }, index) => (
            <div className={styles.slide} key={event.id} role="group"
              aria-label={faMessages.eventPosition(String(fa(index + 1)), String(fa(preview.length)))}>
              <div className={styles.entrance}>
                <EventCard event={event} priority={priority && index < 3} mobilePair serverNow={serverNow} />
              </div>
            </div>
          ))}
          <div className={styles.slide}>
            <div className={styles.entrance}>
              <AppLink data-motion-item href={href} className={styles.showAll} aria-label={faMessages.viewAllSection(String(heading))}>
                {faContent.viewAll}<ArrowLeft size={24} aria-hidden="true" />
              </AppLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
