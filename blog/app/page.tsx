import { Discovery } from "@/components/landing/discovery";
import { HostCallout, Journal, LandingFooter, LandingHeader, Masthead, Questions } from "@/components/landing/home-content";
import { Venues } from "@/components/landing/venues";
import { Markdown } from "@/components/markdown";
import { topics } from "@/lib/landing-content";
import { LandingTheme } from "@/components/landing/landing-theme";
import { getLandingEvents } from "@/lib/landing-events";
import { absoluteUrl, homeMetadata, jsonLd } from "@/lib/seo";
import { getSettings, listPosts } from "@/lib/store";
import "@/components/landing/landing.css";
import "@/landing-site/hamghadam-landing/phone-posters.css";

type HomeProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export function generateMetadata() {
  return homeMetadata(getSettings());
}

export default async function Home({ searchParams }: HomeProps) {
  const settings = getSettings();
  const { posts } = listPosts({ kind: "article", publishedOnly: true, pageSize: 6 });
  const [{ topic, q }, events] = await Promise.all([searchParams, getLandingEvents()]);
  const initialTopic = topics.find(item => item.id === topic)?.id ?? "all";
  const initialQuery = typeof q === "string" ? q.trim().slice(0, 120) : "";

  return <div className="landing">
    <LandingTheme />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: settings.siteName,
      url: absoluteUrl("/"),
      inLanguage: "fa-IR",
      description: settings.seoDescription,
    }) }} />
    <LandingHeader settings={settings} />
    <main id="main" tabIndex={-1}>
      <Discovery masthead={<Masthead settings={settings} />} events={events} initialTopic={initialTopic} initialQuery={initialQuery} />
      <Venues />
      <HostCallout />
      <Journal posts={posts} settings={settings} />
      {settings.homeBody && <div className="wrap editorial-body"><Markdown>{settings.homeBody}</Markdown></div>}
      <Questions />
    </main>
    <LandingFooter settings={settings} />
  </div>;
}
