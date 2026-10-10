"use client";

import { useEffect } from "react";
import { useAppNavigate } from "@/components/event/app-navigation";
import { useEventBrowse } from "@/components/event/event-browse-provider";
import { Catalog } from "./catalog";
import { LoadingState } from "./primitives";

export function HomeEntry({ layout }: { layout: "v1" | "v2" }) {
  const { mapIntroductionCompleted } = useEventBrowse();
  const navigate = useAppNavigate();
  useEffect(() => {
    if (mapIntroductionCompleted === false) {
      navigate(`/map?intro=1${layout === "v2" ? "&layout=v2" : ""}`, { replace: true });
    }
  }, [mapIntroductionCompleted, navigate, layout]);

  // Use the same initial markup on the server and during hydration; don't flash the catalog.
  return mapIntroductionCompleted ? <Catalog layout={layout} /> : <main><LoadingState /></main>;
}
