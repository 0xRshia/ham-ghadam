import type { Post, SiteSettings } from "@/lib/types";
import { postPath } from "@/lib/types";
import { Markdown } from "./markdown";
import { jsonLd, postStructuredData } from "@/lib/seo";

export function PersianDate({ value }: { value: string }) {
  return <time dateTime={value}>{new Intl.DateTimeFormat("fa-IR", { dateStyle: "long", timeZone: "Asia/Tehran" }).format(new Date(value))}</time>;
}

export function PostCard({ post, prominent = false }: { post: Post; prominent?: boolean }) {
  return <article className={`post-card${prominent ? " post-card-featured" : ""}`}>
    {post.coverImage && <a className="card-image" href={postPath(post)} tabIndex={-1} aria-hidden="true"><img src={post.coverImage} alt="" width={800} height={500} loading="lazy" decoding="async" /></a>}
    <div className="card-copy">
      <div className="eyebrow">{post.category || "هم‌قدم"}</div>
      <h3><a href={postPath(post)}>{post.title}</a></h3>
      <p>{post.excerpt}</p>
      <div className="byline"><span>{post.author}</span><span aria-hidden="true">·</span><PersianDate value={post.publishedAt} /></div>
    </div>
  </article>;
}

export function Article({ post, settings }: { post: Post; settings: SiteSettings }) {
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(postStructuredData(post, settings)) }} />
    <article className="article-page">
      <nav className="breadcrumbs" aria-label="مسیر صفحه"><a href="/">خانه</a><span>/</span>{post.kind === "article" && <><a href="/blog">{settings.articlesTitle}</a><span>/</span></>}<span>{post.title}</span></nav>
      <header className="article-heading">
        {post.category && <a className="pill" href={`/blog?category=${encodeURIComponent(post.category)}`}>{post.category}</a>}
        <h1>{post.title}</h1>
        {post.excerpt && <p className="article-intro">{post.excerpt}</p>}
        <div className="byline"><span>{post.author}</span><span aria-hidden="true">·</span><PersianDate value={post.publishedAt} /><span aria-hidden="true">·</span><span>{new Intl.NumberFormat("fa-IR").format(Math.max(1, Math.ceil(post.body.split(/\s+/).length / 200)))} دقیقه مطالعه</span></div>
        {post.updatedAt.slice(0,10) !== post.publishedAt.slice(0,10) && <p className="updated">به‌روزرسانی: <PersianDate value={post.updatedAt} /></p>}
      </header>
      {post.coverImage && <img className="article-cover" src={post.coverImage} alt={post.coverAlt} width={1600} height={1000} fetchPriority="high" />}
      <Markdown>{post.body}</Markdown>
      <div className="article-end"><span className="brand-dot" /><a href="/blog">خواندن نوشته‌های بیشتر</a></div>
    </article>
  </>;
}
