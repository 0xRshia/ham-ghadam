import type { ReactNode } from "react";
import { LandingFooter, LandingHeader } from "@/components/landing/home-content";
import { LandingTheme } from "@/components/landing/landing-theme";
import { getSettings } from "@/lib/store";
import "@/components/landing/landing.css";
import "./article.css";

export default function ArticleLayout({ children }: { children: ReactNode }) {
  const settings = getSettings();
  return <div className="landing reading-page">
    <LandingTheme />
    <LandingHeader settings={settings} reading />
    <main id="main" tabIndex={-1}>{children}</main>
    <LandingFooter settings={settings} reading />
  </div>;
}
