"use client";

import { Icon } from "@/components/icon";
import { themeStorageKey } from "@/lib/landing-content";

export function ThemeButton() {
  function toggleTheme() {
    const root = document.documentElement;
    const current = root.dataset.landingTheme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.dataset.landingTheme = next;
    try { localStorage.setItem(themeStorageKey, next); } catch {}
  }

  return <button type="button" className="icon-button" onClick={toggleTheme} aria-label="تغییر حالت روشن یا تیره">
    <Icon name="moon" className="ico theme-moon" />
    <Icon name="sun" className="ico theme-sun" />
  </button>;
}
