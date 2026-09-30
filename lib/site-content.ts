import { database } from "@/db";
import { initialSiteContent } from "@/lib/initial-content";
import { parseContent } from "@/lib/content-shapes";

const initialByKey = new Map(initialSiteContent.map((entry) => [entry.key, entry.content]));

export async function getSiteContent<T>(key: "faq" | "about" | "contact"): Promise<T> {
  const row = await database().prepare("SELECT content FROM site_content WHERE key=?").bind(key).first<{ content: string }>();
  return parseContent<T>(row?.content, initialByKey.get(key) as T);
}
