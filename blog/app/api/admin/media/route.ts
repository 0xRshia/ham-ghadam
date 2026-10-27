import { assertOrigin, requireAdmin } from "@/lib/auth";
import { readBytes, boundary, json } from "@/lib/http";
import { MAX_IMAGE_BYTES, saveImage } from "@/lib/media";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return boundary(async () => {
    assertOrigin(request);
    await requireAdmin();
    return json(await saveImage(await readBytes(request, MAX_IMAGE_BYTES), request.headers.get("content-type") || ""), 201);
  });
}
