import type { Post, SiteSettings } from "./types.ts";

export class BlogError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "BlogError";
    this.status = status;
  }
}

export function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BlogError(400, "ساختار اطلاعات معتبر نیست.");
  }
  return input as Record<string, unknown>;
}

function text(input: Record<string, unknown>, key: string, max: number, required = false) {
  const value = input[key];
  if (typeof value !== "string") throw new BlogError(400, `مقدار ${key} باید متن باشد.`);
  const normalized = value.trim();
  if (normalized.length > max || (required && !normalized) || /\u0000/.test(normalized)) {
    throw new BlogError(400, `مقدار ${key} خالی یا طول آن نامعتبر است.`);
  }
  return normalized;
}

function boolean(input: Record<string, unknown>, key: string) {
  if (typeof input[key] !== "boolean") throw new BlogError(400, `مقدار ${key} معتبر نیست.`);
  return input[key] as boolean;
}

export function versionInput(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new BlogError(400, "نسخهٔ اطلاعات معتبر نیست؛ صفحه را دوباره باز کنید.");
  }
  return value;
}

export function safeUrl(value: string, allowRelative = false) {
  if (!value) return "";
  if (/[\u0000-\u0020\u007f\\]/.test(value)) throw new BlogError(400, "نشانی نامعتبر است.");
  if (allowRelative && /^\/(?!\/)/.test(value)) return value;
  let url: URL;
  try { url = new URL(value); } catch { throw new BlogError(400, "نشانی باید کامل و با http یا https باشد."); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new BlogError(400, "نشانی باید از http یا https و بدون اطلاعات ورود استفاده کند.");
  }
  return url.href;
}

function urlField(input: Record<string, unknown>, key: string, relative = false) {
  return safeUrl(text(input, key, 2048), relative);
}

export function imageUrl(value: string) {
  if (!value || /^\/media\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/.test(value)) return value;
  if (["/brand/hamghadam-wordmark.svg", "/favicon.svg", "/apple-touch-icon.png"].includes(value)) return value;
  throw new BlogError(400, "تصویر را در کتابخانهٔ رسانهٔ سایت بارگذاری کنید.");
}

function imageField(input: Record<string, unknown>, key: string) {
  return imageUrl(text(input, key, 2048));
}

export type PostInput = Omit<Post, "id" | "createdAt" | "updatedAt" | "version">;

export function postInput(value: unknown): PostInput {
  const input = objectInput(value);
  if (input.kind !== "article" && input.kind !== "page") throw new BlogError(400, "نوع محتوا معتبر نیست.");
  if (input.status !== "draft" && input.status !== "published") throw new BlogError(400, "وضعیت انتشار معتبر نیست.");
  const slug = text(input, "slug", 140, true).normalize("NFC").toLowerCase();
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\p{M}\u200c]*(?:-[\p{L}\p{N}][\p{L}\p{N}\p{M}\u200c]*)*$/u.test(slug)) {
    throw new BlogError(400, "نامک فقط می‌تواند شامل حروف، عدد و خط تیره باشد.");
  }
  const publishedAt = text(input, "publishedAt", 40);
  if (publishedAt && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(publishedAt) || !Number.isFinite(Date.parse(publishedAt)))) {
    throw new BlogError(400, "زمان انتشار باید تاریخ معتبر همراه منطقهٔ زمانی باشد.");
  }
  const normalizedPublication = publishedAt ? new Date(publishedAt).toISOString() : "";
  // Public SQL compares UTC ISO strings; expanded years would break chronological ordering.
  if (normalizedPublication && !/^\d{4}-/.test(normalizedPublication)) {
    throw new BlogError(400, "سال انتشار خارج از بازهٔ مجاز است.");
  }
  const coverImage = imageField(input, "coverImage");
  const coverAlt = text(input, "coverAlt", 300, Boolean(coverImage));
  const canonicalUrl = urlField(input, "canonicalUrl");
  if (canonicalUrl && new URL(canonicalUrl).hash) throw new BlogError(400, "نشانی اصلی صفحه نباید بخش # داشته باشد.");
  return {
    kind: input.kind,
    status: input.status,
    slug,
    title: text(input, "title", 180, true),
    excerpt: text(input, "excerpt", 600),
    body: text(input, "body", 100000, input.status === "published"),
    author: text(input, "author", 100, input.kind === "article" && input.status === "published"),
    category: text(input, "category", 80),
    coverImage, coverAlt,
    seoTitle: text(input, "seoTitle", 180),
    seoDescription: text(input, "seoDescription", 500),
    canonicalUrl,
    ogTitle: text(input, "ogTitle", 180),
    ogDescription: text(input, "ogDescription", 600),
    ogImage: imageField(input, "ogImage"),
    noIndex: boolean(input, "noIndex"),
    featured: boolean(input, "featured"),
    publishedAt: normalizedPublication,
  };
}

export function settingsInput(value: unknown): Omit<SiteSettings, "updatedAt" | "version"> {
  const input = objectInput(value);
  if (!Array.isArray(input.navLinks) || input.navLinks.length > 8) throw new BlogError(400, "حداکثر هشت پیوند ناوبری مجاز است.");
  const navLinks = input.navLinks.map(value => {
    const link = objectInput(value);
    return { label: text(link, "label", 60, true), href: safeUrl(text(link, "href", 2048, true), true) };
  });
  const canonicalUrl = urlField(input, "canonicalUrl");
  if (canonicalUrl && new URL(canonicalUrl).hash) throw new BlogError(400, "نشانی اصلی صفحه نباید بخش # داشته باشد.");
  const googleVerification = text(input, "googleVerification", 200);
  if (googleVerification && !/^[\w-]+$/.test(googleVerification)) throw new BlogError(400, "کد تأیید گوگل معتبر نیست.");
  const logoUrl = imageUrl(text(input, "logoUrl", 2048, true));
  return {
    siteName: text(input, "siteName", 100, true),
    tagline: text(input, "tagline", 200),
    heroEyebrow: text(input, "heroEyebrow", 120),
    heroTitle: text(input, "heroTitle", 200, true),
    heroDescription: text(input, "heroDescription", 1000),
    homeBody: text(input, "homeBody", 50000),
    ctaLabel: text(input, "ctaLabel", 80, true),
    ctaUrl: safeUrl(text(input, "ctaUrl", 2048, true), true),
    articlesTitle: text(input, "articlesTitle", 100, true),
    emptyMessage: text(input, "emptyMessage", 500, true),
    footerText: text(input, "footerText", 1000),
    navLinks,
    seoTitle: text(input, "seoTitle", 180, true),
    seoDescription: text(input, "seoDescription", 500, true),
    canonicalUrl,
    ogTitle: text(input, "ogTitle", 180),
    ogDescription: text(input, "ogDescription", 600),
    socialImage: imageField(input, "socialImage"),
    logoUrl,
    organizationName: text(input, "organizationName", 100, true),
    googleVerification,
    noIndex: boolean(input, "noIndex"),
  };
}
