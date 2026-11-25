"use client";

import { X } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { squirrelCopy } from "@/locales/squirrel-fa";

export function GameExitLink({ href, onExit, className = "sg-icon-button", tabIndex }: {
  href: string;
  onExit?: () => void;
  className?: string;
  tabIndex?: number;
}) {
  return <AppLink href={href} className={className} aria-label={squirrelCopy.close} onClick={onExit} tabIndex={tabIndex}>
    <X size={21} aria-hidden="true" />
  </AppLink>;
}
