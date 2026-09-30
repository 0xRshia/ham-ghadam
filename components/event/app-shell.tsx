"use client";
import { faContent } from "@/locales/domain-fa";
import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Compass,
  Ticket,
  UserRound,
  LogOut,
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
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
  const scannerOnly = path === "/scanner";
  async function refresh() {
    await api<Omit<Auth, "refresh" | "loading" | "logout" | "loggingOut">>("/api/me").then(
      (data) => setState({ ...data, loading: false }),
      () => setState((state) => ({ ...state, loading: false })),
    );
  }
  useEffect(() => {
    if (!scannerOnly) void refresh();
  }, [scannerOnly]);
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await api("/api/auth/logout", {});
      setState((s) => ({ ...s, user: null }));
      navigate("/");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoggingOut(false);
    }
  }
  if (scannerOnly) return <div data-route-content className="route-content">{children}</div>;
  if (/^\/host\/events\/[^/]+\/(tiers|program)$/.test(path) || ["/", "/events", "/map", "/favorites", "/filters", "/settings", "/email/unsubscribe", "/reservations", "/account", "/account/edit", "/account/details", "/following", "/notifications", "/login", "/signup", "/forgot-password", "/welcome", "/onboarding", "/faq", "/about", "/privacy"].includes(path) || path.startsWith("/settings/") || path.startsWith("/reservations/") || path.startsWith("/organizers/") || path.startsWith("/collections/") || eventDetail || /^\/events\/[^/]+\/tickets$/.test(path)) {
    return <AuthContext.Provider value={{ ...state, refresh, logout, loggingOut }}><EvenlineFrame>{children}</EvenlineFrame></AuthContext.Provider>;
  }
  return (
    <AuthContext.Provider value={{ ...state, refresh, logout, loggingOut }}>
      <a className="skip-link" href="#main-content">{faContent.skipToContent}</a>
      <header className="site-header">
        <div className="header-inner">
          <AppLink className="brand" href="/">
            <img src="/favicon.svg" alt="" />
            {faContent.appName}<span>{faContent.companionTagline}</span>
          </AppLink>
          <nav ref={desktopNav} className="selection-track" aria-label={faContent.mainNavigation}>
            <span className="selection-indicator" aria-hidden="true" />
            <AppLink className={discovering ? "active" : ""} href="/">
              {faContent.discoverEvents}</AppLink>
            <AppLink
              className={path === "/reservations" ? "active" : ""}
              href="/reservations"
            >
              {faContent.myTickets}</AppLink>
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
        <AppLink
          className={path === "/reservations" ? "active" : ""}
          href="/reservations"
          aria-current={path === "/reservations" ? "page" : undefined}
        >
          <Ticket size={24} aria-hidden="true" />
          {faContent.myTickets}</AppLink>
        <AppLink className={path === "/account" ? "active" : ""} href="/account" aria-current={path === "/account" ? "page" : undefined}>
          <UserRound size={24} aria-hidden="true" />
          {faContent.account}</AppLink>
      </nav>
      <Toaster position="top-center" dir="rtl" richColors />
    </AuthContext.Provider>
  );
}
