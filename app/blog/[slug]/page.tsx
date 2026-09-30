import { faContent, faMessages } from "@/locales/domain-fa";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import Image from "next/image";
import { ArrowRight, CalendarDays, UserRound } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { database } from "@/db";
import styles from "@/components/content/site-pages.module.css";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await database().prepare("SELECT title,excerpt FROM articles WHERE slug=? AND status='published' AND published_at IS NOT NULL").bind(slug).first<{ title: string; excerpt: string }>();
  return article ? { title: faMessages.blogArticleTitle(String(article.title)), description: article.excerpt } : { title: faContent.articleNotFoundTitle };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await database().prepare("SELECT a.id,a.title,a.excerpt,a.body,a.category,a.author_name,a.published_at,m.id AS media_id FROM articles a LEFT JOIN article_media m ON m.article_id=a.id WHERE a.slug=? AND a.status='published' AND a.published_at IS NOT NULL").bind(slug).first<{ id: string; title: string; excerpt: string; body: string; category: string; author_name: string; published_at: number; media_id: string | null }>();
  if (!article) notFound();
  return <main className={`container ${styles.page}`}>
    <AppLink className={styles.backLink} href="/blog"><ArrowRight size={17} />{faContent.backToMagazine}</AppLink>
    <header className={styles.articleHeader}>
      {article.category && <span className={styles.articleCategory}>{article.category}</span>}
      <h1>{article.title}</h1><p>{article.excerpt}</p>
      <div className={styles.articleByline}><span><UserRound size={15} />{article.author_name}</span><span><CalendarDays size={15} />{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long", timeZone: "Asia/Tehran" }).format(article.published_at)}</span></div>
    </header>
    {article.media_id && <Image className={styles.articleHeroImage} src={`/api/article-media/${encodeURIComponent(article.media_id)}`} alt="" width={1400} height={900} unoptimized />}
    <article className={styles.articleBody}><ReactMarkdown skipHtml disallowedElements={["img"]}>{article.body}</ReactMarkdown></article>
    <div className={styles.cta}><AppLink className="button outline" href="/blog"><ArrowRight size={16} />{faContent.allArticles}</AppLink></div>
  </main>;
}
