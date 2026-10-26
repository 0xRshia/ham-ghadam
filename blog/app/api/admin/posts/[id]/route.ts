import { requireAdmin, assertOrigin } from "@/lib/auth";
import { savePost, deletePost } from "@/lib/store";
import { boundary, json, readJson } from "@/lib/http";
import { postInput } from "@/lib/validation";
import { assertReferencedImages } from "@/lib/media";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, { params }: Context) {
  return boundary(async () => {
    assertOrigin(request); await requireAdmin(); const data = await readJson(request);
    const post = postInput(data.post);
    await assertReferencedImages(post.body, [post.coverImage, post.ogImage]);
    return json({ post: savePost(data.post, (await params).id) });
  });
}
export async function DELETE(request: Request, { params }: Context) {
  return boundary(async () => { assertOrigin(request); await requireAdmin(); const data = await readJson(request); deletePost((await params).id, data.version); return json({ ok: true }); });
}
