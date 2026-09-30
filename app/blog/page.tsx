import { faContent, faMessages } from "@/locales/domain-fa";
import { ArrowLeft, BookOpen, CalendarDays, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import Image from "next/image";
import { AppLink } from "@/components/event/app-navigation";
import { database } from "@/db";
import { pageResult, readPage } from "@/lib/pagination";
import { faDigits } from "@/lib/types";
import styles from "@/components/content/site-pages.module.css";

export const metadata = { title: faContent.magazineTitle, description: faContent.magazineDescription };

type ArticleCard = { id: string; slug: string; title: string; excerpt: string; category: string; author_name: string; published_at: number; media_id: string | null };

export default async function BlogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const pageUrl = new URL("https://local.invalid/blog");
  for (const [key, value] of Object.entries(query)) if (value !== undefined) pageUrl.searchParams.set(key, Array.isArray(value) ? value[0] : value);
  let pagination: ReturnType<typeof readPage>;
  try { pagination = readPage(pageUrl, 12); } catch { notFound(); }
  const { page, pageSize, offset } = pagination;
  const db = database();
  const count = await db.prepare("SELECT COUNT(*) AS total FROM articles WHERE status='published' AND published_at IS NOT NULL").first<{ total: number }>();
  const rows = await db.prepare("SELECT a.id,a.slug,a.title,a.excerpt,a.category,a.author_name,a.published_at,m.id AS media_id FROM articles a LEFT JOIN article_media m ON m.article_id=a.id WHERE a.status='published' AND a.published_at IS NOT NULL ORDER BY a.published_at DESC,a.created_at DESC,a.id DESC LIMIT ? OFFSET ?").bind(pageSize, offset).all<ArticleCard>();
  const result = pageResult(rows.results ?? [], Number(count?.total ?? 0), page, pageSize);
  if (page > result.totalPages) notFound();
  return <main className={`container ${styles.page}`}>
    <header className={`${styles.hero} ${styles.blogIntro}`}>
      <span className={styles.eyebrow}><BookOpen size={16} />{faContent.magazineTitle}</span>
      <h1>{faContent.nextMeetupIdeas}</h1>
      <p>{faContent.magazineIntroduction}</p>
    </header>
    {result.items.length ? <section className={styles.blogGrid} aria-label={faContent.publishedArticles}>
      {result.items.map((article) => <article className={styles.articleCard} key={article.id}>
        <AppLink href={`/blog/${encodeURIComponent(article.slug)}`} aria-label={faMessages.readArticle(String(article.title))}>
          {article.media_id ? <Image className={styles.articleCover} src={`/api/article-media/${encodeURIComponent(article.media_id)}`} alt="" width={800} height={480} sizes="(max-width: 760px) 100vw, 33vw" unoptimized /> : <div className={styles.articleCoverEmpty}><BookOpen size={36} /></div>}
        </AppLink>
        <div className={styles.articleCardBody}>
          {article.category && <span className={styles.articleCategory}>{article.category}</span>}
          <h2><AppLink href={`/blog/${encodeURIComponent(article.slug)}`}>{article.title}</AppLink></h2>
          <p>{article.excerpt}</p>
          <div className={styles.articleMeta}><span><UserRound size={14} />{article.author_name}</span><span><CalendarDays size={14} />{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(article.published_at)}</span></div>
          <AppLink className={styles.articleRead} href={`/blog/${encodeURIComponent(article.slug)}`}>{faContent.readMore + " "}<ArrowLeft size={15} /></AppLink>
        </div>
      </article>)}
    </section> : <div className={styles.emptyState}>{faContent.noPublishedArticles}</div>}
    {result.totalPages > 1 && <nav className={styles.pager} aria-label={faContent.articlePages}>
      {result.page > 1 && <AppLink href={`/blog?page=${result.page - 1}`}>{faContent.previousPage}</AppLink>}
      <span>{faContent.pageOf + " "}{faDigits(result.page)} {" " + faContent.from + " "}{faDigits(result.totalPages)}</span>
      {result.page < result.totalPages && <AppLink href={`/blog?page=${result.page + 1}`}>{faContent.nextPage}</AppLink>}
    </nav>}
  </main>;
}
