"use client";
import { faContent } from "@/locales/domain-fa";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Compass,
  UserRound,
  LogOut,
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { invalidateEventCatalog } from "@/hooks/use-event-catalog";
import { api } from "@/lib/client";
import type { User } from "@/lib/types";
import { ThemeMenu } from "@/components/event/theme-menu";
import { AppLink, useAppNavigate } from "./app-navigation";
import { useSelectionIndicator } from "@/hooks/use-selection-indicator";
import { EvenlineFrame } from "@/components/evenline/primitives";
import { SiteFooter } from "@/components/content/site-footer";
import { AuthContext, type Auth } from "./auth-context";
export { useAuth } from "./auth-context";
export function AppShell({ children }: { children: ReactNode }) {
  const [state, setState] = useState({
    user: null as User | null,
    loading: true,
    smsReady: false,
    temporaryLoginEnabled: false,
    paymentReady: false,
    skipPayDevEnabled: false,
  });
  const path = usePathname().replace(/\/$/, "") || "/";
  const eventDetail = /^\/events\/[^/]+$/.test(path) && path !== "/events/free";
  const discovering = path === "/" || path === "/events" || path === "/events/free";
  const navigate = useAppNavigate();
  const desktopNav = useSelectionIndicator<HTMLElement>("a.active");
  const [loggingOut, setLoggingOut] = useState(false);
  const scannerOnly = path === "/scanner" || path === "/fast" || path.startsWith("/fast/");
  const authRequestVersion = useRef(0);
  async function refresh(initial = false) {
    const version = ++authRequestVersion.current;
    if (!initial) { invalidateEventCatalog(); setState(state => ({ ...state, loading: true })); }
    await api<Omit<Auth, "refresh" | "loading" | "logout" | "loggingOut">>("/api/me").then(
      (data) => { if (version === authRequestVersion.current) setState({ ...data, loading: false }); },
      () => { if (version === authRequestVersion.current) setState((state) => ({ ...state, loading: false })); },
    );
  }
  useEffect(() => {
    if (!scannerOnly) void Promise.resolve().then(() => refresh(true));
  }, [scannerOnly]);
  async function logout() {
    if (loggingOut) return;
    authRequestVersion.current++;
    setLoggingOut(true);
    try {
      await api("/api/auth/logout", {});
      invalidateEventCatalog();
      setState((s) => ({ ...s, user: null }));
      navigate("/");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoggingOut(false);
      setState(state => ({ ...state, loading: false }));
    }
  }
  if (scannerOnly) return <div data-route-content className="route-content">{children}</div>;
  if (/^\/host\/events\/[^/]+\/(tiers|program)$/.test(path) || ["/", "/events", "/events/free", "/map", "/favorites", "/filters", "/settings", "/email/unsubscribe", "/reservations", "/account", "/account/edit", "/account/details", "/following", "/notifications", "/login", "/signup", "/forgot-password", "/welcome", "/onboarding", "/faq", "/about", "/privacy"].includes(path) || path.startsWith("/settings/") || path.startsWith("/reservations/") || path.startsWith("/organizers/") || path.startsWith("/collections/") || eventDetail || /^\/events\/[^/]+\/tickets$/.test(path)) {
    return <AuthContext.Provider value={{ ...state, refresh, logout, loggingOut }}><EvenlineFrame>{children}</EvenlineFrame></AuthContext.Provider>;
  }
  return (
    <AuthContext.Provider value={{ ...state, refresh, logout, loggingOut }}>
      <a className="skip-link" href="#main-content">{faContent.skipToContent}</a>
      <header className="site-header">
        <div className="header-inner">
          <AppLink className="brand" href="/">
            <img src="/favicon.svg" alt="" />
            <img className="brand-wordmark" src="/brand/hamghadam-wordmark.svg" width={120} height={49} alt={faContent.appName} /><span>{faContent.companionTagline}</span>
          </AppLink>
          <nav ref={desktopNav} className="selection-track" aria-label={faContent.mainNavigation}>
            <span className="selection-indicator" aria-hidden="true" />
            <AppLink className={discovering ? "active" : ""} href="/">
              {faContent.discoverEvents}</AppLink>
            <AppLink
              className={path === "/account" ? "active" : ""}
              href="/account"
            >
              {faContent.account}</AppLink>
          </nav>
          <div className="account-actions">
            <ThemeMenu />
            {state.user ? (
              <>
                <AppLink className="button outline login-link" href="/account">
                  <UserRound size={16} />
                  {state.user.name || faContent.account}
                </AppLink>
                <button
                  className="icon-button logout"
                  type="button"
                  disabled={loggingOut}
                  aria-busy={loggingOut}
                  onClick={logout}
                  aria-label={faContent.logout}
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <AppLink className="button outline login-link" href="/login">
                {faContent.loginRegister + " "}<ArrowLeft size={16} />
              </AppLink>
            )}
          </div>
        </div>
      </header>
      <div id="main-content" tabIndex={-1} data-route-content data-event-detail={eventDetail || undefined} className="route-content">{children}</div>
      <SiteFooter />
      <nav className={`mobile-nav${eventDetail ? " event-detail-nav" : ""}`} aria-label={faContent.mainNavigation}>
        <AppLink className={discovering ? "active" : ""} href="/" aria-current={discovering ? "page" : undefined}>
          <Compass size={24} aria-hidden="true" />
          {faContent.discoverEvent}</AppLink>
        <AppLink className={path === "/account" ? "active" : ""} href="/account" aria-current={path === "/account" ? "page" : undefined}>
          <UserRound size={24} aria-hidden="true" />
          {faContent.account}</AppLink>
      </nav>
      <Toaster position="top-center" dir="rtl" richColors />
    </AuthContext.Provider>
  );
}
