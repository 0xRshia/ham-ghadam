"use client";

import { faContent } from "@/locales/domain-fa";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

const subscribeMounted = () => () => {};

export function ThemeMenu({ className = "icon-button theme-trigger" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeMounted, () => true, () => false);
  const selected = mounted && theme === "dark" ? "dark" : "light";
  const nextTheme = selected === "dark" ? "light" : "dark";
  const label = nextTheme === "dark" ? faContent.switchToDark : faContent.switchToLight;

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-pressed={selected === "dark"}
      title={label}
      disabled={!mounted}
      onClick={() => setTheme(nextTheme)}
    >
      {selected === "dark" ? (
        <Sun size={24} aria-hidden="true" />
      ) : (
        <Moon size={24} aria-hidden="true" />
      )}
    </button>
  );
}
