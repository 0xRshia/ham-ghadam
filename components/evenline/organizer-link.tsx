"use client";

import type { ComponentProps } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AppLink, useAppNavigate } from "@/components/event/app-navigation";
import { organizerProfileHref } from "@/lib/organizer-navigation";

export function OrganizerLink({ organizerId, onNavigate, ...props }: Omit<ComponentProps<typeof AppLink>, "href"> & { organizerId: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const navigate = useAppNavigate();
  const query = params.toString();
  const from = pathname + (query ? `?${query}` : "");
  return <AppLink {...props} href={organizerProfileHref(organizerId, from)} onNavigate={event => {
    let cancelled = false;
    onNavigate?.({ preventDefault: () => { cancelled = true; } });
    event.preventDefault();
    if (!cancelled) {
      // Read at click time so an event section/hash survives the round trip too.
      navigate(organizerProfileHref(organizerId, window.location.pathname + window.location.search + window.location.hash));
    }
  }} />;
}
