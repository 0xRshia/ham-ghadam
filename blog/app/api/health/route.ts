import { getDatabase } from "@/lib/store";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try { getDatabase().prepare("SELECT 1").get(); return json({ status: "ok", service: "hamghadam-blog" }); }
  catch { return json({ status: "unavailable" }, 503); }
}
