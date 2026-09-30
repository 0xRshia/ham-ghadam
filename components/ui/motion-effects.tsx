"use client";

import { useEffect, useLayoutEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { motionSettings } from "@/lib/motion";

const targetSelector = "[data-motion-item], [data-motion-group] > *";
const markerSelector = "[data-motion-item], [data-motion-group], [data-motion-key]";
const controlSelector = 'button, a[href], [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

export function MotionEffects() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    if (reducedMotion) return;
    let visible = new Set<HTMLElement>();
    const animations = new Map<HTMLElement, Animation>();
    const changedScopes = new Set<Element>();
    let frame = 0;

    function reveal() {
      frame = 0;
      const root = document.querySelector<HTMLElement>("[data-route-content]");
      if (!root) return;
      const candidates = Array.from(root.querySelectorAll<HTMLElement>(targetSelector))
        .filter((element) => !element.closest("[hidden], [inert], [data-motion-skip]") &&
          !element.querySelector("[data-motion-skip]") &&
          element.getClientRects().length > 0);
      // Only leaf groups own entrances; animating their parents would compound motion.
      const candidateSet = new Set(candidates);
      const parents = new Set<HTMLElement>();
      for (const element of candidates) {
        for (let parent = element.parentElement; parent && parent !== root; parent = parent.parentElement) {
          if (candidateSet.has(parent)) parents.add(parent);
        }
      }
      const targets = candidates.filter((element) => !parents.has(element));
      const nextVisible = new Set(targets);
      for (const [element, animation] of animations) {
        if (!nextVisible.has(element)) {
          animation.cancel();
          animations.delete(element);
        }
      }
      const entering = targets.filter((element) => !visible.has(element) ||
        Array.from(changedScopes).some((scope) => scope.contains(element)));
      visible = nextVisible;
      changedScopes.clear();
      const rtl = getComputedStyle(root).direction === "rtl";
      const ordered = entering.map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .sort((a, b) => Math.abs(a.rect.top - b.rect.top) > 4
          ? a.rect.top - b.rect.top
          : rtl ? b.rect.right - a.rect.right : a.rect.left - b.rect.left);
      const settings = motionSettings(root);
      ordered.forEach(({ element }, index) => {
        animations.get(element)?.cancel();
        if (element.contains(document.activeElement)) return;
        const animation = element.animate(
          [{ opacity: 0, translate: "0 8px" }, { opacity: 1, translate: "0 0" }],
          {
            duration: settings.entrance,
            delay: ordered.length > 1 ? index * settings.stagger / (ordered.length - 1) : 0,
            easing: settings.easing,
            fill: "backwards",
          },
        );
        animations.set(element, animation);
        void animation.finished.catch(() => {}).finally(() => {
          if (animations.get(element) === animation) animations.delete(element);
        });
      });
    }

    const observer = new MutationObserver((records) => {
      const relevant = records.some((record) => {
        if (record.type === "attributes") return true;
        if (record.target instanceof Element && record.target.matches("[data-motion-group]")) return true;
        return [...record.addedNodes, ...record.removedNodes].some((node) =>
          node instanceof Element && (node.matches(markerSelector) || node.querySelector(markerSelector)));
      });
      for (const record of records) {
        if (record.attributeName === "data-motion-key" && record.target instanceof Element) {
          changedScopes.add(record.target);
        }
      }
      // Countdown glyphs and text updates do not schedule or replay page entrances.
      if (relevant && !frame) frame = requestAnimationFrame(reveal);
    });
    observer.observe(document.body, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ["hidden", "inert", "data-motion-key"],
    });
    const revealFocused = (event: FocusEvent) => {
      for (const [element, animation] of animations) {
        if (event.target instanceof Node && element.contains(event.target)) {
          animation.cancel();
          animations.delete(element);
        }
      }
    };
    document.addEventListener("focusin", revealFocused);
    reveal();
    return () => {
      observer.disconnect();
      document.removeEventListener("focusin", revealFocused);
      cancelAnimationFrame(frame);
      animations.forEach((animation) => animation.cancel());
    };
  }, [pathname, search, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    const animations = new Map<HTMLElement, Animation>();
    function acknowledge(event: MouseEvent) {
      const element = event.target instanceof Element
        ? event.target.closest<HTMLElement>(controlSelector) : null;
      if (!element || element.closest('[inert], [disabled], [aria-disabled="true"], [data-disabled]')) return;
      animations.get(element)?.cancel();
      const style = getComputedStyle(element);
      const shadow = style.boxShadow === "none" ? "0 0 0 0 transparent" : style.boxShadow;
      const highlight = `${shadow}, 0 0 0 4px ${style.getPropertyValue("--focus-shadow").trim()}`;
      const settings = motionSettings(element);
      // Click also covers native keyboard activation, without delaying the action.
      const animation = element.animate([
        { scale: ".98", boxShadow: highlight },
        { scale: "1", boxShadow: shadow },
      ], { duration: settings.feedback, easing: settings.easing });
      animations.set(element, animation);
      void animation.finished.catch(() => {}).finally(() => {
        if (animations.get(element) === animation) animations.delete(element);
      });
    }
    document.addEventListener("click", acknowledge, true);
    return () => {
      document.removeEventListener("click", acknowledge, true);
      animations.forEach((animation) => animation.cancel());
    };
  }, [reducedMotion]);

  return null;
}
