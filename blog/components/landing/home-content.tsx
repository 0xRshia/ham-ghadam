import { EnamadTrustSeal } from "@/components/enamad-trust-seal";
import { Icon } from "@/components/icon";
import { PersianDate, ReadingTime } from "@/components/public";
import { eventApp, eventCalendar, eventMap, instagram } from "@/lib/landing-content";
import { postPath, type Post, type SiteSettings } from "@/lib/types";
import { ThemeButton } from "./theme";

const defaultLinks = [
  { label: "خانه", href: "/" },
  { label: "مجله", href: "/blog" },
  { label: "کشف رویدادها", href: eventApp },
];

const landingLinks = [
  { label: "رویدادهای منتخب", href: "#experiences" },
  { label: "تهران روی نقشه", href: "#places" },
  { label: "برای میزبان‌ها", href: "#hosts" },
  { label: "مجلهٔ هم‌قدم", href: "#journal" },
];

function Brand({ siteName, logoUrl }: Pick<SiteSettings, "siteName" | "logoUrl">) {
  return <a className="landing-brand" href="/" aria-label={siteName}>
    {logoUrl === "/brand/hamghadam-wordmark.svg" ? <span className="theme-mark" aria-hidden="true" />
      : <img className="custom-logo" src={logoUrl} width={116} height={44} alt="" />}
  </a>;
}

type FrameProps = { settings: SiteSettings; reading?: boolean };

export function LandingHeader({ settings, reading = false }: FrameProps) {
  const useDefaultLinks = settings.navLinks.length === defaultLinks.length
    && settings.navLinks.every((link, index) => {
      const expected = defaultLinks[index];
      const href = link.href === `${eventApp}/` ? eventApp : link.href;
      return href === expected.href && link.label === expected.label;
    });
  const navigation = useDefaultLinks ? landingLinks : settings.navLinks;
  const ctaLabel = !reading && settings.ctaLabel === "کشف رویدادها" ? "ورود به وب‌اپ" : settings.ctaLabel;
  const customTagline = settings.tagline !== "برای تجربه‌های تازه، هم‌قدم شو" && settings.tagline;

  return <header className="landing-header">
    <div className="wrap landing-header-inner">
      <div className="landing-brand-group">
        <Brand siteName={settings.siteName} logoUrl={settings.logoUrl} />
        {customTagline && <span className="landing-tagline">{customTagline}</span>}
      </div>
      <nav className={useDefaultLinks ? "desktop-nav" : "desktop-nav custom-nav"} aria-label="منوی اصلی">
        {navigation.map(({ href, label }, index) => <a key={`${href}-${index}`}
          href={reading && href.startsWith("#") ? `/${href}` : href}
          aria-current={reading && ["#journal", "/#journal", "/blog"].includes(href) ? "location" : undefined}>{label}</a>)}
      </nav>
      <div className="header-tools"><ThemeButton />
        <a className="landing-button header-app" href={settings.ctaUrl}>{ctaLabel} <Icon name="arrow-up-left" className="ico" /></a>
      </div>
    </div>
    {reading && <span className="reading-progress" aria-hidden="true" />}
  </header>;
}

export function LandingFooter({ settings, reading = false }: FrameProps) {
  return <>
    <footer className="footer"><div className="wrap footer-inner">
      <div className="landing-footer-brand">
        <Brand siteName={settings.siteName} logoUrl={settings.logoUrl} />
        <p>{settings.footerText === "هم‌قدم، همراه شما برای کشف رویدادها و تجربه‌های تازه."
          ? "همراه تو، قدم به قدم." : settings.footerText}</p>
      </div>
      <nav aria-label="پیوندهای پایانی">
        <a href={reading ? "/#hosts" : "#hosts"}>برای میزبان‌ها</a><a href="/blog">مجله</a>
        <a href={instagram}><Icon name="instagram" className="ico" />اینستاگرام</a>
        <a href="/admin">مدیریت</a>
      </nav>
      <EnamadTrustSeal />
    </div></footer>
    {!reading && <nav className="mobile-nav" aria-label="منوی اصلی موبایل">
      <a href="/" aria-current="page"><span className="app-icon icon-home" aria-hidden="true" />خانه</a>
      <a href={eventCalendar}><span className="app-icon icon-discover" aria-hidden="true" />کشف</a>
      <a href={eventMap}><span className="app-icon icon-map" aria-hidden="true" />نقشه</a>
      <a href="#journal"><Icon name="book" className="ico" />مجله</a>
    </nav>}
  </>;
}

export function Masthead({ settings }: { settings: SiteSettings }) {
  const title = settings.heroTitle === "از خواندن تا تجربه کردن، یک قدم فاصله است"
    ? <>این آخر هفته، <span>کجا بریم؟</span></> : settings.heroTitle;
  const description = settings.heroDescription === "اینجا دربارهٔ رویدادها، تجربه‌های جمعی و کشف فرصت‌های تازه می‌خوانیم. برای دیدن رویدادهای پیش رو، وارد برنامهٔ هم‌قدم شوید."
    ? "پوسترها رو ورق بزن و برای وقت آزادت توی تهران یه برنامه پیدا کن." : settings.heroDescription;
  const eyebrow = settings.heroEyebrow === "مجلهٔ هم‌قدم" ? "تهران با فندق" : settings.heroEyebrow;

  return <div className="wrap weekend-mast">
    <div className="weekend-title">
      {eyebrow && <a className="weekend-location" href="#places"><Icon name="pin" className="ico" />{eyebrow}</a>}
      <h1>{title}</h1>
    </div>
    <div className="weekend-aside">
      {description && <p>{description}</p>}
      <a className="map-jump" href="#places"><span className="app-icon icon-map" aria-hidden="true" />
        تهران روی نقشه <Icon name="chevron-left" className="ico" />
      </a>
    </div>
  </div>;
}

export function HostCallout() {
  return <section id="hosts" className="wrap host-section" aria-labelledby="host-title">
    <div className="host-panel">
      <div className="host-copy">
        <span className="overline">برای میزبان‌ها</span>
        <h2 id="host-title">رویدادت رو به هم‌قدم بیار.</h2>
        <p>میزبان کارگاه یا دورهمی هستی؟ نام برنامه، زمان و محلش رو برای تیم هم‌قدم بفرست تا دربارهٔ معرفی رویدادت صحبت کنیم.</p>
        <a className="landing-button host-button" href={instagram}>
          <Icon name="instagram" className="ico" /> ارتباط با تیم هم‌قدم <Icon name="arrow-up-left" className="ico" />
        </a>
      </div>
      <img className="host-photo" src="/landing/workshop.webp" width={920} height={613}
        alt="دو نفر در کارگاه سفال لبهٔ یک کاسه را شکل می‌دهند" loading="lazy" />
    </div>
  </section>;
}

export function Journal({ posts, settings }: { posts: Post[]; settings: SiteSettings }) {
  const title = settings.articlesTitle === "تازه‌ترین نوشته‌ها" ? "مجلهٔ هم‌قدم" : settings.articlesTitle;

  return <section id="journal" className="wrap journal-section" aria-labelledby="journal-title">
    <div className="section-head" id="stories">
      <h2 id="journal-title">{title}</h2>
      <a className="inline-link" href="/blog">همهٔ نوشته‌ها <Icon name="chevron-left" className="ico" /></a>
    </div>
    {posts.length > 0 ? <div className="landing-stories">
      {posts.map(post => <a className="story" key={post.id} href={postPath(post)} aria-labelledby={`story-${post.id}`}>
        {post.coverImage && <span className="story-cover">
          <img src={post.coverImage} width={800} height={450} alt={post.coverAlt} loading="lazy" decoding="async" />
        </span>}
        <div className="story-meta"><PersianDate value={post.publishedAt} /><i aria-hidden="true" /><ReadingTime body={post.body} /></div>
        <h3 id={`story-${post.id}`}>{post.title}</h3>
        <div className="story-footer"><span className="story-topic"><Icon name="book" className="ico" />{post.category || settings.siteName}</span>
          <span className="story-link" aria-hidden="true">خواندن مطلب</span></div>
      </a>)}
    </div> : <div className="landing-empty"><p>{settings.emptyMessage}</p></div>}
  </section>;
}

export function Questions() {
  return <section className="wrap faq-section" aria-labelledby="faq-title">
    <h2 id="faq-title">پیش از رفتن</h2>
    <div className="questions">
      <details><summary>برای دیدن رویدادها باید برنامه نصب کنم؟<Icon name="plus" className="ico" /></summary>
        <p>هم‌قدم توی مرورگر گوشی و کامپیوتر باز می‌شه. از <a href={eventCalendar}>فهرست رویدادها</a> شروع کن.</p>
      </details>
      <details><summary>رویدادهای نزدیکم رو چطور پیدا کنم؟<Icon name="plus" className="ico" /></summary>
        <p><a href={eventMap}>نقشهٔ رویدادها</a> رو باز کن، شهر رو انتخاب کن و برنامه‌های محدوده‌ای رو که دوست داری ببین.</p>
      </details>
      <details><summary>ساعت، آدرس و شرایط شرکت رو کجا ببینم؟<Icon name="plus" className="ico" /></summary>
        <p>روی کارت رویداد بزن. توی صفحهٔ برنامه، زمان، محل برگزاری و جزئیاتی که میزبان منتشر کرده رو می‌بینی.</p>
      </details>
    </div>
  </section>;
}
