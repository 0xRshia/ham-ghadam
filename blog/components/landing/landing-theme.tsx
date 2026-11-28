import { themeStorageKey } from "@/lib/landing-content";

const initializeTheme = `try {
  var theme = localStorage.getItem(${JSON.stringify(themeStorageKey)});
  if (theme === "dark" || theme === "light") document.documentElement.dataset.landingTheme = theme;
} catch {}`;

export function LandingTheme() {
  return <>
    <script dangerouslySetInnerHTML={{ __html: initializeTheme }} />
    <noscript><style>{".landing .icon-button, .landing .flip { display: none; }"}</style></noscript>
  </>;
}
