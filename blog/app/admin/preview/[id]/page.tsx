import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getPost } from "@/lib/store";
import { BlogError } from "@/lib/validation";
import { MarkdownPreview } from "@/components/markdown-editor";

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof BlogError && error.status === 401) redirect("/admin/login");
    throw error;
  }
  const post = getPost((await params).id);
  if (!post) notFound();
  return <div className="admin-preview-page">
    <div className="admin-preview-banner"><span>پیش‌نمایش خصوصی نسخهٔ ذخیره‌شده · {post.status === "draft" ? "پیش‌نویس" : "منتشرشده / زمان‌بندی‌شده"}</span><a href="/admin">بازگشت به مدیریت</a></div>
    <article>
      {post.category && <p className="admin-eyebrow">{post.category}</p>}
      <h1>{post.title}</h1>
      <p className="admin-muted">{post.author}</p>
      {post.excerpt && <p className="admin-preview-excerpt">{post.excerpt}</p>}
      {post.coverImage && <img className="admin-preview-cover" src={post.coverImage} alt={post.coverAlt} width={1200} height={675} />}
      <MarkdownPreview body={post.body} />
    </article>
  </div>;
}
