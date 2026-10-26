import { getSettings, listPosts } from "@/lib/store";
import { absoluteUrl, homeMetadata, jsonLd } from "@/lib/seo";
import { PostCard } from "@/components/public";
import { Markdown } from "@/components/markdown";

export function generateMetadata() { return homeMetadata(getSettings()); }

export default function Home() {
  const settings = getSettings();
  const { posts } = listPosts({ kind: "article", publishedOnly: true, pageSize: 6 });
  const ordered = [...posts].sort((a, b) => Number(b.featured) - Number(a.featured));
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({ "@context": "https://schema.org", "@type": "WebSite", name: settings.siteName, url: absoluteUrl("/"), inLanguage: "fa-IR", description: settings.seoDescription }) }} />
    <section className="hero container">
      <div className="hero-copy"><p className="eyebrow"><span className="brand-dot" />{settings.heroEyebrow}</p><h1>{settings.heroTitle}</h1><p className="hero-description">{settings.heroDescription}</p><div className="hero-actions"><a className="button" href={settings.ctaUrl}>{settings.ctaLabel}<span aria-hidden="true">↖</span></a><a className="text-link" href="#stories">{settings.articlesTitle}<span aria-hidden="true">↓</span></a></div></div>
      <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="brand-tile"><img src="/brand/hamghadam-symbol.svg" width={140} height={140} alt="" /></div><span className="art-dot dot-one"/><span className="art-dot dot-two"/><span className="art-plus">+</span><span className="art-caption">{settings.siteName}</span></div>
    </section>
    {settings.homeBody && <section className="home-body container"><Markdown>{settings.homeBody}</Markdown></section>}
    <section id="stories" className="stories container"><div className="section-heading"><h2>{settings.articlesTitle}</h2>{posts.length > 0 && <a className="text-link" href="/blog">همه نوشته‌ها <span aria-hidden="true">←</span></a>}</div>
      {ordered.length ? <div className="post-grid">{ordered.map(post => <PostCard key={post.id} post={post} prominent={post.featured} />)}</div> : <div className="empty-state"><span className="empty-icon" aria-hidden="true">✦</span><p>{settings.emptyMessage}</p></div>}
    </section>
  </>;
}
