import { getDatabase } from "@/lib/store";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    getDatabase().prepare("SELECT 1").get();
    return json({ status: "ok", service: "hamghadam-blog", revision: process.env.BLOG_REVISION || undefined });
  }
  catch { return json({ status: "unavailable" }, 503); }
}
