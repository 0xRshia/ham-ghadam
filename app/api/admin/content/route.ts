import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { initialSiteContent } from "@/lib/initial-content";
import { ApiError, body, boundary, json, rateLimit, requireAdmin, sameOrigin } from "@/lib/server";

const keys = new Set(["faq", "about", "contact"]);
function text(value: unknown, maximum: number, required = true): value is string {
  return typeof value === "string" && value.length <= maximum && (!required || !!value.trim());
}
function validContent(key: string, content: unknown) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return false;
  const value = content as Record<string, unknown>;
  if (!["eyebrow", "title", "intro"].every((field) => text(value[field], 300))) return false;
  if (key === "faq") return Array.isArray(value.items) && value.items.length <= 50 && value.items.every((item) => !!item && typeof item === "object" && text((item as Record<string, unknown>).question, 300) && text((item as Record<string, unknown>).answer, 3000));
  if (key === "about") return Array.isArray(value.sections) && value.sections.length <= 20 && value.sections.every((item) => !!item && typeof item === "object" && text((item as Record<string, unknown>).heading, 300) && text((item as Record<string, unknown>).body, 3000));
  return text(value.email, 254, false) && text(value.phone, 32, false) && text(value.address, 500, false);
}

export const GET = (req: Request) => boundary(async () => {
  await requireAdmin(req);
  const rows = await database().prepare("SELECT key,content,updated_at,updated_by FROM site_content ORDER BY key").all<{ key: string; content: string; updated_at: number; updated_by: string | null }>();
  const present = new Map((rows.results ?? []).map((row) => [row.key, row]));
  return json({ items: initialSiteContent.map((entry) => ({ key: entry.key, content: JSON.parse(present.get(entry.key)?.content ?? JSON.stringify(entry.content)), updated_at: present.get(entry.key)?.updated_at ?? null, updated_by: present.get(entry.key)?.updated_by ?? null })) });
});

export const PATCH = (req: Request) => boundary(async () => {
  sameOrigin(req);
  const admin = await requireAdmin(req);
  await rateLimit(`admin-content:${admin.id}`, 60, 250);
  const data = await body(req, 500000);
  if (typeof data.key !== "string" || !keys.has(data.key) || !validContent(data.key, data.content)) throw new ApiError(400, faContent.invalidPageContent);
  const now = Date.now();
  await database().prepare("INSERT INTO site_content(key,content,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET content=excluded.content,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(data.key, JSON.stringify(data.content), now, admin.id).run();
  return json({ saved: true, updated_at: now });
});
