import { fromMarkdown } from "mdast-util-from-markdown";
import { toString } from "mdast-util-to-string";
import { ArticleReader } from "@/components/article-reader";
import { Icon } from "@/components/icon";
import { Markdown } from "@/components/markdown";
import { PersianDate, ReadingTime } from "@/components/public";
import { publicPost } from "@/lib/public-post";
import { jsonLd, postMetadata, postStructuredData } from "@/lib/seo";
import { getSettings, listPosts } from "@/lib/store";
import { postPath, type Post } from "@/lib/types";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  return postMetadata(publicPost("article", (await params).slug), getSettings());
}

function ArticleTitle({ title }: { title: string }) {
  const long = title.length > 44;
  const words = Array.from(title.matchAll(/\S+/g));
  let breakAt = title.search(/(?<=[؛:])\s+(?=\S)/);
  if (!long) breakAt = words.length >= 4 ? words[Math.ceil(words.length / 2)].index : -1;
  const lead = breakAt > 0 ? title.slice(0, breakAt).trimEnd() : "";
  const tail = breakAt > 0 ? title.slice(breakAt).trimStart() : title;
  return <h1 className={`article-title ${long ? "title-long" : "title-signature"}`} id="article-title">
    {lead && `${lead} `}{long && !lead ? title : <span className="title-line"><span>{tail}</span></span>}
  </h1>;
}

function nextArticle(post: Post) {
  function candidate(category?: string) {
    return listPosts({ kind: "article", publishedOnly: true, category, pageSize: 2 }).posts.find(other => other.id !== post.id);
  }
  return (post.category ? candidate(post.category) : undefined) ?? candidate();
}

export default async function ArticlePage({ params }: Props) {
  const post = publicPost("article", (await params).slug);
  const settings = getSettings();
  const related = nextArticle(post);
  const journal = settings.articlesTitle === "تازه‌ترین نوشته‌ها" ? "مجلهٔ هم‌قدم" : settings.articlesTitle;
  const sections: { id: string; label: string }[] = [];
  const headingIds = new Map<number, string>();
  for (const node of fromMarkdown(post.body).children) {
    if (node.type !== "heading" || node.depth > 2 || !node.position) continue;
    const label = toString(node, { includeHtml: false }).trim();
    if (!label) continue;
    const id = `section-${sections.length + 1}`;
    sections.push({ id, label });
    headingIds.set(node.position.start.line, id);
  }
  const split = post.excerpt.length > 200 ? post.excerpt.search(/(?<=[.!؟?])\s+(?=\S)/) : -1;
  const standfirst = split < 0 ? post.excerpt : post.excerpt.slice(0, split);
  const introduction = split < 0 ? "" : post.excerpt.slice(split).trimStart();

  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(postStructuredData(post, settings)) }} />
    <article aria-labelledby="article-title">
      <header className="article-mast"><div className="wrap article-spread">
        <div className="cover-copy">
          <nav className="article-path" aria-label="مسیر مقاله">
            <a href="/blog"><Icon name="book" className="ico" />{journal}</a>
            {post.category && <><Icon name="chevron-left" className="ico path-chevron" />
              <a href={`/blog?category=${encodeURIComponent(post.category)}`}>{post.category}</a></>}
          </nav>
          <ArticleTitle title={post.title} />
          {standfirst && <p className="article-standfirst">{standfirst}</p>}
          <div className="article-meta">
            <span className="article-author">نوشتهٔ {post.author}</span><i aria-hidden="true" />
            <PersianDate value={post.publishedAt} /><i aria-hidden="true" />
            <span className="article-duration"><Icon name="clock" className="ico" /><ReadingTime body={post.body} /></span>
          </div>
        </div>
        {post.coverImage && <figure className="cover-print">
          <img src={post.coverImage} alt={post.coverAlt} width={1600} height={900} fetchPriority="high" />
        </figure>}
      </div></header>
      <ArticleReader sections={sections}>
        {introduction && <p className="reader-intro">{introduction}</p>}
        <Markdown headingIds={headingIds}>{post.body}</Markdown>
        {post.updatedAt.slice(0, 10) !== post.publishedAt.slice(0, 10) &&
          <p className="article-updated">آخرین به‌روزرسانی <PersianDate value={post.updatedAt} /></p>}
      </ArticleReader>
    </article>
    <div className="wrap next-reading">
      <div className="section-head">
        {related && <h2>نوشتهٔ مرتبط</h2>}
        <a className="inline-link" href="/blog">بازگشت به مجله <Icon name="chevron-left" className="ico" /></a>
      </div>
      {related && <a className="next-card" href={postPath(related)} aria-labelledby="related-title">
        {related.coverImage && <img src={related.coverImage} alt="" width={320} height={200} loading="lazy" />}
        <div className="next-copy">
          <span className="next-meta">{related.category && <>{related.category}<i aria-hidden="true" /></>}<ReadingTime body={related.body} /></span>
          <h3 id="related-title">{related.title}</h3>
        </div>
        <span className="next-arrow"><Icon name="arrow-left" className="ico" /></span>
      </a>}
    </div>
  </>;
}
