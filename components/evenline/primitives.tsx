"use client";

import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { AppLink } from "@/components/event/app-navigation";
import { usePathname } from "next/navigation";
import sourceIcons from "./source-icons.json";
import { copy } from "@/locales/fa";

type Asset = { src: string; width?: number; height?: number };
export function SourceIcon({ asset, dark, size = 24, directional = false }: { asset: Asset; dark?: Asset; size?: number; directional?: boolean }) {
  return <span className={`el-icon${directional ? " el-directional" : ""}`} style={{ inlineSize: size, blockSize: size }} aria-hidden="true">
    <img className={dark ? "el-light-asset" : undefined} src={asset.src} width={asset.width} height={asset.height} alt="" />
    {dark && <img className="el-dark-asset" src={dark.src} width={dark.width} height={dark.height} alt="" />}
  </span>;
}

export function Button({ variant = "primary", small = false, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary"; small?: boolean }) {
  return <button {...props} className={`el-button el-button-${variant}${small ? " el-button-small" : ""} ${className}`} />;
}

export function Header({ title, back = "/", actions, onBack }: { title?: string; back?: string; actions?: ReactNode; onBack?: () => void }) {
  return <header className="el-header">
    <AppLink href={back} onNavigate={onBack ? event => { event.preventDefault(); onBack(); } : undefined} className="el-icon-button" aria-label={copy.back}><SourceIcon asset={sourceIcons["20"]["arrow-narrow-left"][0].light} dark={sourceIcons["20"]["arrow-narrow-left"][0].dark} size={32} directional /></AppLink>
    {title && <h1>{title}</h1>}<div className="el-header-actions">{actions}</div>
  </header>;
}

export function SectionHeading({ children, href, actions }: { children: ReactNode; href?: string; actions?: ReactNode }) {
  return <div className="el-section-heading"><h2>{children}</h2>{actions ?? (href && <AppLink href={href}>{copy.all}</AppLink>)}</div>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="el-status" role="alert"><p>{message}</p>{retry && <Button onClick={retry}>{copy.retry}</Button>}</div>;
}

export function LoadingState() {
  return <p className="el-status" role="status">{copy.loading}</p>;
}

const navigation = [
  { href: "/", label: copy.home, icon: "home-2" },
  { href: "/events", label: copy.explore, icon: "Search" },
  { href: "/favorites", label: copy.favorites, icon: "heart" },
  { href: "/reservations", label: copy.tickets, icon: "ticket" },
  { href: "/account", label: copy.profile, icon: "profile-circle" },
];

export function EvenlineFrame({ children }: { children: ReactNode }) {
  const path = usePathname().replace(/\/$/, "") || "/";
  const showNavigation = ["/", "/events", "/favorites", "/reservations", "/account"].includes(path);
  const screen = ({ "/": "17", "/events": "32", "/favorites": "37", "/reservations": "38", "/account": "44" } as Record<string,string>)[path] ?? "17";
  const icons = (sourceIcons as Record<string,Record<string,{ light: Asset; dark: Asset }[]>>)[screen];
  return <div className={`el-app${showNavigation ? " el-with-navigation" : ""}`}>
    <div id="main-content" className="el-route" tabIndex={-1}>{children}</div>
    {showNavigation && <nav className="el-navigation" aria-label={copy.navigation}>{navigation.map(item => {
      const selected = item.href === path;
      const variants = icons[item.icon];
      const icon = variants[variants.length - 1];
      return <AppLink key={item.href} href={item.href} aria-current={selected ? "page" : undefined}>
        <SourceIcon asset={icon.light} dark={icon.dark} />
        <span>{item.label}</span>
      </AppLink>;
    })}</nav>}
  </div>;
}

export { useFavorites } from "@/hooks/use-favorites";
