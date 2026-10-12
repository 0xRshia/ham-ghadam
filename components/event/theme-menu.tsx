"use client";

import { faContent } from "@/locales/domain-fa";
import { useState, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import styles from "./theme-menu.module.css";

const subscribeMounted = () => () => {};

export function ThemeMenu({ className = "icon-button theme-trigger" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeMounted, () => true, () => false);
  const [animate, setAnimate] = useState(false);
  const selected = mounted && resolvedTheme === "dark" ? "dark" : "light";
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
      onClick={() => { setAnimate(true); setTheme(nextTheme); }}
    >
      <span className={styles.icons} data-theme={selected} data-animate={animate} aria-hidden="true">
        <Moon className={styles.moon} size={24} />
        <Sun className={styles.sun} size={24} />
      </span>
    </button>
  );
}
