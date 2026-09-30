"use client";

import { useLayoutEffect, useRef, type ComponentProps } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { motionSettings } from "@/lib/motion";

export function AnimatedRegion({
  children,
  className,
  contentClassName,
  transitionKey,
  animateHeight = true,
  ...props
}: ComponentProps<"div"> & {
  contentClassName?: string;
  transitionKey?: string | number;
  animateHeight?: boolean;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const previousHeight = useRef<number | null>(null);
  const heightAnimation = useRef<Animation | null>(null);
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner || !animateHeight) return;

    function measure() {
      if (!outer || !inner) return;
      const nextHeight = inner.getBoundingClientRect().height;
      const lastHeight = previousHeight.current;
      previousHeight.current = nextHeight;
      if (lastHeight === null || Math.abs(nextHeight - lastHeight) < 1) return;
      const startHeight = heightAnimation.current
        ? outer.getBoundingClientRect().height
        : lastHeight;
      heightAnimation.current?.cancel();
      if (reducedMotion) return;
      const settings = motionSettings(outer);
      const animation = outer.animate(
        [{ height: `${startHeight}px` }, { height: `${nextHeight}px` }],
        { duration: settings.panel, easing: settings.easing },
      );
      heightAnimation.current = animation;
      outer.dataset.resizing = "true";
      void animation.finished.catch(() => {}).finally(() => {
        if (heightAnimation.current !== animation) return;
        heightAnimation.current = null;
        delete outer.dataset.resizing;
      });
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [reducedMotion, animateHeight]);

  useLayoutEffect(() => {
    if (reducedMotion) {
      heightAnimation.current?.cancel();
    }
    return () => {
      heightAnimation.current?.cancel();
    };
  }, [reducedMotion]);

  return (
    <div ref={outerRef} data-motion-key={transitionKey} className={cn("animated-region", className)} {...props}>
      <div ref={innerRef} data-motion-group className={cn("animated-region-content", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
