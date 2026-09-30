import { faContent, faMessages } from "@/locales/domain-fa";
import { ApiError } from "@/lib/server";

function field(value: unknown, name: string, max: number, required = true) {
  if (typeof value !== "string") throw new ApiError(400, faMessages.requiredField(String(name)));
  const normalized = value.trim();
  if (required && !normalized) throw new ApiError(400, faMessages.requiredField(String(name)));
  if (normalized.length > max) throw new ApiError(400, faMessages.fieldTooLong(String(name)));
  return normalized;
}

export function articleInput(data: Record<string, unknown>) {
  const slug = field(data.slug, faContent.articleSlug, 140);
  if (!/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug)) throw new ApiError(400, faContent.articleSlugInvalid);
  const status = data.status;
  if (status !== "draft" && status !== "published") throw new ApiError(400, faContent.invalidArticleStatus);
  return {
    slug,
    title: field(data.title, faContent.title, 180),
    excerpt: field(data.excerpt, faContent.summary, 400, false),
    body: field(data.body, faContent.articleBody, 50000),
    category: field(data.category, faContent.category, 80, false),
    author_name: field(data.author_name, faContent.authorName, 100),
    status,
  };
}
