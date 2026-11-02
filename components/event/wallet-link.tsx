"use client";

import { Wallet } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { walletCopy } from "@/locales/wallet-fa";

/** Header shortcut shown beside the theme toggle; /wallet handles signed-out visitors. */
export function WalletLink({ className = "icon-button theme-trigger" }: { className?: string }) {
  return <AppLink href="/wallet" className={className} aria-label={walletCopy.open} title={walletCopy.open}>
    <Wallet size={24} aria-hidden="true" />
  </AppLink>;
}
