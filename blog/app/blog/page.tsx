import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSettings, listPosts, allPublishedPosts } from "@/lib/store";
import { absoluteUrl } from "@/lib/seo";
import { PostCard } from "@/components/public";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
function filters(values: Record<string, string | string[] | undefined>) {
  const page = Number(values.page || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) notFound();
  return { page, query: typeof values.q === "string" ? values.q.slice(0,200) : "", category: typeof values.category === "string" ? values.category.slice(0,80) : "" };
}
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { page, query, category } = filters(await searchParams);
  const settings = getSettings();
  return { title: `${settings.articlesTitle}${page > 1 ? ` — صفحه ${page}` : ""} | ${settings.siteName}`, description: settings.seoDescription, alternates: { canonical: absoluteUrl(`/blog${page > 1 && !query && !category ? `?page=${page}` : ""}`) }, robots: { index: !query && !category, follow: true } };
}
export default async function Blog({ searchParams }: Props) {
  const { page, query, category } = filters(await searchParams);
  const settings = getSettings();
  const { posts, total } = listPosts({ kind: "article", publishedOnly: true, query, category, page, pageSize: 12 });
  if (page > 1 && posts.length === 0) notFound();
  const categories = [...new Set(allPublishedPosts().filter(p => p.kind === "article").map(p => p.category).filter(Boolean))];
  const pageLink = (number: number) => `/blog?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(category ? { category } : {}), page: String(number) })}`;
  return <section className="archive container"><div className="archive-header"><p className="eyebrow">{settings.siteName}</p><h1>{settings.articlesTitle}</h1><p>{settings.heroDescription}</p></div>
    <form className="search-form" method="get" action="/blog"><label htmlFor="search">جست‌وجو در نوشته‌ها</label><div><input id="search" name="q" defaultValue={query} maxLength={200} type="search"/><button className="button" type="submit">جست‌وجو</button></div></form>
    {categories.length > 0 && <nav className="category-list" aria-label="دسته‌بندی نوشته‌ها"><a className={!category ? "pill active" : "pill"} href="/blog">همه</a>{categories.map(c => <a key={c} className={category === c ? "pill active" : "pill"} href={`/blog?category=${encodeURIComponent(c)}`}>{c}</a>)}</nav>}
    {posts.length ? <div className="post-grid">{posts.map(post => <PostCard key={post.id} post={post} />)}</div> : <div className="empty-state"><p>{query || category ? "نوشته‌ای با این جست‌وجو پیدا نشد." : settings.emptyMessage}</p>{(query || category) && <a href="/blog">نمایش همه نوشته‌ها</a>}</div>}
    {total > 12 && <nav className="pagination" aria-label="صفحه‌بندی">{page > 1 && <a className="button secondary" href={pageLink(page-1)}>صفحه قبل</a>}<span>صفحه {new Intl.NumberFormat("fa-IR").format(page)}</span>{page * 12 < total && <a className="button secondary" href={pageLink(page+1)}>صفحه بعد</a>}</nav>}
  </section>;
}
