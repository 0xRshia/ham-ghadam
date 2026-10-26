import { sessionFromCookies } from "@/lib/auth";
import { isPublicImage, loadImage } from "@/lib/media";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isPublicImage(`/media/${name}`) && !(await sessionFromCookies())) return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const data = await loadImage(name);
  if (!data) return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/webp", "Content-Length": String(data.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
