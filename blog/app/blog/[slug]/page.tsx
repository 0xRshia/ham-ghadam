import { getSettings, listPosts } from "@/lib/store";
import { publicPost } from "@/lib/public-post";
import { postMetadata } from "@/lib/seo";
import { Article, PostCard } from "@/components/public";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) { return postMetadata(publicPost("article", (await params).slug), getSettings()); }
export default async function Post({ params }: Props) {
  const post = publicPost("article", (await params).slug);
  const settings = getSettings();
  const related = listPosts({ kind: "article", publishedOnly: true, category: post.category, pageSize: 4 }).posts.filter(p => p.id !== post.id).slice(0,3);
  return <><Article post={post} settings={settings} />{related.length > 0 && <section className="stories container"><h2>نوشته‌های مرتبط</h2><div className="post-grid">{related.map(p => <PostCard key={p.id} post={p} />)}</div></section>}</>;
}
