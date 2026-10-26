import { requireAdmin } from "@/lib/auth";
import { getSettings, listPosts } from "@/lib/store";
import { boundary, json } from "@/lib/http";
export async function GET() {
  return boundary(async () => {
    await requireAdmin();
    const first = listPosts({ page: 1, pageSize: 100 });
    const posts = [...first.posts];
    for (let page = 2; posts.length < first.total; page++) {
      const batch = listPosts({ page, pageSize: 100 }).posts;
      if (!batch.length) break;
      posts.push(...batch);
    }
    return json({ posts, settings: getSettings() });
  });
}
