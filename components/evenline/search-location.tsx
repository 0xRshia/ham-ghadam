"use client";
import { AppLink } from "@/components/event/app-navigation";
import { useEventBrowse } from "@/components/event/event-browse-provider";
import { copy } from "@/locales/fa";
import { FigmaIcon } from "./source-icon";
export function SearchLocation() {
  const {filters}=useEventBrowse();
  return <AppLink className="el-search-location" href="/map" aria-label={copy.map}><span><FigmaIcon screen={35} name="map-pin"/></span><b>{filters.city==="all" ? copy.chooseCity : filters.city==="nearby" ? copy.nearby : filters.city}</b></AppLink>;
}
