"use client";

import { usePathname } from "next/navigation";
import { LoadingPage, type LoadingVariant } from "@/components/event/loading";
import { HomeLoading, BrandSplash } from "@/components/evenline/skeleton";
import { Header, LoadingState } from "@/components/evenline/primitives";

export default function Loading() {
  const pathname = usePathname().replace(/\/$/, "") || "/";
  if (pathname === "/") return <HomeLoading/>;
  if (["/welcome","/onboarding"].includes(pathname)) return <BrandSplash/>;
  if (!pathname.startsWith("/host") && pathname!=="/scanner") return <main><Header/><LoadingState/></main>;
  // The root boundary can stream before the nested route boundary is ready.
  let variant: LoadingVariant;
  if (pathname === "/") variant = "discovery";
  else if (pathname === "/events" || pathname === "/events/free") variant = "catalog";
  else if (pathname.startsWith("/events/")) variant = "event";
  else if (pathname === "/reservations") variant = "reservations";
  else if (pathname === "/account") variant = "account";
  else if (pathname === "/host") variant = "host";
  else if (pathname.startsWith("/host/events/")) variant = "host-event";
  else if (pathname === "/scanner") variant = "scanner";
  else return null;
  return <LoadingPage variant={variant} />;
}
