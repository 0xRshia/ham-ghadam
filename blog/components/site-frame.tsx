"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function SiteFrame({ header, footer, children }: {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  if (usePathname() === "/") return children;

  return <>
    {header}
    <main id="main" tabIndex={-1}>{children}</main>
    {footer}
  </>;
}
