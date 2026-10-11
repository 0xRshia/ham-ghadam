"use client";
import { AppLink } from "@/components/event/app-navigation";
import { useEventBrowse } from "@/components/event/event-browse-provider";
import { copy } from "@/locales/fa";
import { MapPin } from "lucide-react";
export function SearchLocation() {
  const {filters}=useEventBrowse();
  return <AppLink className="el-search-location" href="/map" aria-label={copy.map}><span><MapPin size={16} fill="none" aria-hidden="true" /></span><b>{filters.city==="all" ? copy.chooseCity : filters.city==="nearby" ? copy.nearby : filters.city}</b></AppLink>;
}
