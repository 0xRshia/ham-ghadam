"use client";

import { useLayoutEffect, useRef } from "react";

/** Anchor the indicator to inline-start in either writing direction. */
export function useSelectionIndicator<T extends HTMLElement>(selector: string) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const measure = () => {
      const selected = container.querySelector<HTMLElement>(selector);
      if (!selected) {
        container.style.setProperty("--indicator-opacity", "0");
        return;
      }
      // Layout offsets exclude the control's press scale and the track's scroll.
      const rtl = getComputedStyle(container).direction === "rtl";
      const inlineOffset = rtl
        ? selected.offsetLeft - (container.clientWidth - selected.offsetWidth)
        : selected.offsetLeft;
      container.style.setProperty("--indicator-x", `${inlineOffset}px`);
      container.style.setProperty("--indicator-y", `${selected.offsetTop}px`);
      container.style.setProperty("--indicator-width", `${selected.offsetWidth}px`);
      container.style.setProperty("--indicator-height", `${selected.offsetHeight}px`);
      container.style.setProperty("--indicator-opacity", "1");
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(container);
    Array.from(container.children).forEach((child) => resize.observe(child));
    const mutation = new MutationObserver(measure);
    mutation.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "aria-selected", "aria-pressed", "data-state"],
    });
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  });

  return ref;
}
