import type { MetadataRoute } from "next";
import { getSettings, allPublishedPosts } from "@/lib/store";
import { absoluteUrl } from "@/lib/seo";
import { postPath } from "@/lib/types";
export const dynamic = "force-dynamic";
export default function sitemap(): MetadataRoute.Sitemap {
  const settings = getSettings();
  return [
    ...(!settings.noIndex && (!settings.canonicalUrl || settings.canonicalUrl === absoluteUrl("/")) ? [{ url: absoluteUrl("/") }] : []),
    { url: absoluteUrl("/blog") },
    ...allPublishedPosts().filter(p => !p.noIndex && (!p.canonicalUrl || p.canonicalUrl === absoluteUrl(postPath(p)))).map(p => ({ url: absoluteUrl(postPath(p)), lastModified: new Date(p.updatedAt) })),
  ];
}
