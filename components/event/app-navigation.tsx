"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext, Suspense, useCallback, useContext, type ComponentProps, type ReactNode,
} from "react";
import { MotionEffects } from "@/components/ui/motion-effects";

type NavigateOptions = { replace?: boolean; scroll?: boolean };
type Navigate = (href: string, options?: NavigateOptions) => void;
const NavigationContext = createContext<Navigate | null>(null);

export function AppNavigation({ children }: { children: ReactNode }) {
  const router = useRouter();

  const navigate = useCallback<Navigate>((href, options = {}) => {
    const target = new URL(href, window.location.href);
    if (target.origin !== window.location.origin) {
      window.location.assign(target.href);
      return;
    }
    const destination = target.pathname + target.search + target.hash;
    const from = `${window.location.pathname}?${new URLSearchParams(window.location.search)}`;
    const to = `${target.pathname}?${target.searchParams}`;
    if (from === to && target.hash === window.location.hash) return;
    if (options.replace) router.replace(destination, { scroll: options.scroll ?? true });
    else router.push(destination, { scroll: options.scroll ?? true });
  }, [router]);

  return (
    <NavigationContext.Provider value={navigate}>
      <Suspense fallback={null}><MotionEffects /></Suspense>
      {children}
    </NavigationContext.Provider>
  );
}

export function useAppNavigate() {
  const navigate = useContext(NavigationContext);
  if (!navigate) throw new Error("App navigation requires AppNavigation.");
  return navigate;
}

// vinext beta prefetch imports fail in production; navigation still uses the router.
export function AppLink({ href, onNavigate, replace, scroll, prefetch = false, ...props }:
  Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const navigate = useAppNavigate();
  return (
    <Link {...props} prefetch={prefetch} href={href} replace={replace} scroll={scroll} onNavigate={(event) => {
      let cancelled = false;
      onNavigate?.({ preventDefault: () => { cancelled = true; } });
      event.preventDefault();
      if (!cancelled) navigate(href, { replace, scroll });
    }} />
  );
}
