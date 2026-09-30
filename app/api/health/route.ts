import { database } from "@/db";
import { json } from "@/lib/server";

export async function GET() {
  try {
    await database().prepare("SELECT id FROM events LIMIT 1").first();
    return json({ status: "ok" });
  } catch {
    return json({ status: "unavailable" }, 503);
  }
}
