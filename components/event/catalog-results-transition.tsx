"use client";

import { type ReactNode } from "react";
import { AnimatedRegion } from "@/components/ui/animated-region";

export function CatalogResultsTransition({ children, transitionKey }: {
  children: ReactNode;
  transitionKey: string;
}) {
  return (
    <AnimatedRegion className="catalog-results" transitionKey={transitionKey}>
      {children}
    </AnimatedRegion>
  );
}
