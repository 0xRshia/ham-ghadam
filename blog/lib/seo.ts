import type { Metadata } from "next";
import { origin } from "./config.ts";
import { postPath, type Post, type SiteSettings } from "./types.ts";

export const absoluteUrl = (path: string) => new URL(path, origin()).href;
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

export function homeMetadata(settings: SiteSettings): Metadata {
  const title = settings.seoTitle || settings.heroTitle;
  const description = settings.seoDescription || settings.heroDescription;
  const canonical = settings.canonicalUrl || absoluteUrl("/");
  const images = settings.socialImage ? [{ url: absoluteUrl(settings.socialImage), alt: settings.siteName }] : [];
  return {
    title, description, alternates: { canonical },
    robots: { index: !settings.noIndex, follow: true },
    openGraph: { type: "website", locale: "fa_IR", siteName: settings.siteName, title: settings.ogTitle || title, description: settings.ogDescription || description, url: canonical, images },
    twitter: { card: images.length ? "summary_large_image" : "summary", title: settings.ogTitle || title, description: settings.ogDescription || description, images: images.map(i => i.url) },
    verification: settings.googleVerification ? { google: settings.googleVerification } : undefined,
  };
}

export function postMetadata(post: Post, settings: SiteSettings): Metadata {
  const title = post.seoTitle || `${post.title} | ${settings.siteName}`;
  const description = post.seoDescription || post.excerpt || post.body.replace(/[#*_`>\[\]]/g, "").replace(/\s+/g, " ").slice(0, 160);
  const canonical = post.canonicalUrl || absoluteUrl(postPath(post));
  const image = post.ogImage || post.coverImage || settings.socialImage;
  const images = image ? [{ url: absoluteUrl(image), alt: post.coverAlt || post.title }] : [];
  return {
    title, description, alternates: { canonical },
    robots: { index: !post.noIndex, follow: true, googleBot: { index: !post.noIndex, follow: true, "max-image-preview": "large" } },
    openGraph: { type: post.kind === "article" ? "article" : "website", locale: "fa_IR", siteName: settings.siteName, title: post.ogTitle || title, description: post.ogDescription || description, url: canonical, images, ...(post.kind === "article" ? { publishedTime: post.publishedAt, modifiedTime: post.updatedAt, authors: [post.author], section: post.category } : {}) },
    twitter: { card: images.length ? "summary_large_image" : "summary", title: post.ogTitle || title, description: post.ogDescription || description, images: images.map(i => i.url) },
  };
}

export function postStructuredData(post: Post, settings: SiteSettings) {
  const url = absoluteUrl(postPath(post));
  const breadcrumbs = { "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: settings.siteName, item: absoluteUrl("/") },
    ...(post.kind === "article" ? [{ "@type": "ListItem", position: 2, name: settings.articlesTitle, item: absoluteUrl("/blog") }] : []),
    { "@type": "ListItem", position: post.kind === "article" ? 3 : 2, name: post.title, item: url },
  ] };
  const article = {
    "@type": post.kind === "article" ? "BlogPosting" : "WebPage", "@id": url, url,
    headline: post.title, description: post.excerpt, inLanguage: "fa-IR",
    datePublished: post.publishedAt, dateModified: post.updatedAt,
    ...(post.author ? { author: { "@type": "Person", name: post.author } } : {}),
    publisher: { "@type": "Organization", name: settings.organizationName || settings.siteName, logo: { "@type": "ImageObject", url: absoluteUrl(settings.logoUrl) } },
    mainEntityOfPage: post.canonicalUrl || url,
    ...(post.coverImage ? { image: [absoluteUrl(post.coverImage)] } : {}),
  };
  return { "@context": "https://schema.org", "@graph": [article, breadcrumbs] };
}
