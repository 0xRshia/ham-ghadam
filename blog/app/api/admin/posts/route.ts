import { requireAdmin, assertOrigin } from "@/lib/auth";
import { savePost } from "@/lib/store";
import { boundary, json, readJson } from "@/lib/http";
import { postInput } from "@/lib/validation";
import { assertReferencedImages } from "@/lib/media";
export async function POST(request: Request) {
  return boundary(async () => {
    assertOrigin(request); await requireAdmin(); const data = await readJson(request);
    const post = postInput(data.post);
    await assertReferencedImages(post.body, [post.coverImage, post.ogImage]);
    return json({ post: savePost(data.post, undefined, data.publishNow), serverTime: new Date().toISOString() }, 201);
  });
}
