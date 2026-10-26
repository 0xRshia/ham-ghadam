import type { Metadata } from "next";
import { getSettings } from "@/lib/store";
import { origin } from "@/lib/config";
import "./globals.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function generateMetadata(): Promise<Metadata> {
  return { metadataBase: new URL(origin()), icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" } };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = getSettings();
  return <html lang="fa" dir="rtl"><head><link rel="preload" href="/fonts/darbareh/darbareh-variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" /></head>
    <body><a className="skip-link" href="#main">رفتن به محتوای اصلی</a>
      <header className="site-header"><div className="header-inner">
        <a href="/" className="brand" aria-label={settings.siteName}><img src={settings.logoUrl} width={120} height={44} alt={settings.siteName} /><span>{settings.tagline}</span></a>
        <nav aria-label="ناوبری اصلی">{settings.navLinks.map((link, i) => <a key={`${link.href}-${i}`} href={link.href}>{link.label}</a>)}</nav>
        <a className="button header-cta" href={settings.ctaUrl}>{settings.ctaLabel}<span aria-hidden="true">↖</span></a>
      </div></header>
      <main id="main">{children}</main>
      <footer className="site-footer"><div><a href="/" className="footer-brand">{settings.siteName}<span className="brand-dot" /></a><p>{settings.footerText}</p></div><nav aria-label="پیوندهای پایانی"><a href="/blog">{settings.articlesTitle}</a><a href={settings.ctaUrl}>{settings.ctaLabel}</a><a href="/admin">مدیریت</a></nav></footer>
    </body></html>;
}
