export type Post = {
  id: string;
  kind: "article" | "page";
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  author: string;
  category: string;
  coverImage: string;
  coverAlt: string;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  noIndex: boolean;
  featured: boolean;
  status: "draft" | "published";
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type SiteSettings = {
  siteName: string;
  tagline: string;
  heroEyebrow: string;
  heroTitle: string;
  heroDescription: string;
  homeBody: string;
  ctaLabel: string;
  ctaUrl: string;
  articlesTitle: string;
  emptyMessage: string;
  footerText: string;
  navLinks: { label: string; href: string }[];
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  socialImage: string;
  logoUrl: string;
  organizationName: string;
  googleVerification: string;
  noIndex: boolean;
  updatedAt: string;
  version: number;
};

export function postPath(post: Pick<Post, "kind" | "slug">) {
  return `${post.kind === "article" ? "/blog" : "/pages"}/${encodeURIComponent(post.slug)}`;
}
