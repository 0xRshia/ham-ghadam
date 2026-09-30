import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import {
  ApiError,
  body,
  boundary,
  json,
  rateLimit,
  requireUser,
  sameOrigin,
} from "@/lib/server";
import { pageResult, readPage } from "@/lib/pagination";

const customerQuery = `
  SELECT u.id user_id,u.name,u.phone,
    COUNT(DISTINCT r.id) purchase_count,
    COUNT(DISTINCT CASE WHEN e.sample=1 OR r.payment_state='skipped_dev' THEN r.id END) demo_count,
    COALESCE(SUM(CASE WHEN e.sample=0 AND r.payment_state='paid' THEN r.total ELSE 0 END),0) spend,
    MAX(r.created_at) last_purchase,
    (SELECT COALESCE(r2.attendee_name,u.name) FROM reservations r2 JOIN events e2 ON e2.id=r2.event_id WHERE r2.user_id=u.id AND e2.host_id=?1 AND r2.status='confirmed' ORDER BY r2.created_at DESC,r2.id DESC LIMIT 1) booking_name,
    (SELECT COALESCE(r2.attendee_phone,u.phone) FROM reservations r2 JOIN events e2 ON e2.id=r2.event_id WHERE r2.user_id=u.id AND e2.host_id=?1 AND r2.status='confirmed' ORDER BY r2.created_at DESC,r2.id DESC LIMIT 1) booking_phone,
    COALESCE(m.notes,'') notes,COALESCE(m.tags,'[]') tags
  FROM users u JOIN reservations r ON r.user_id=u.id JOIN events e ON e.id=r.event_id
  LEFT JOIN host_customer_metadata m ON m.host_id=?1 AND m.user_id=u.id
  WHERE e.host_id=?1 AND r.status='confirmed'
    AND (?2='' OR lower(u.name) LIKE '%'||lower(?2)||'%' OR lower(u.phone) LIKE '%'||lower(?2)||'%' OR EXISTS(
      SELECT 1 FROM reservations matched JOIN events matched_event ON matched_event.id=matched.event_id
      WHERE matched.user_id=u.id AND matched_event.host_id=?1 AND matched.status='confirmed'
        AND (lower(COALESCE(matched.attendee_name,'')) LIKE '%'||lower(?2)||'%' OR lower(COALESCE(matched.attendee_phone,'')) LIKE '%'||lower(?2)||'%')
    ))
  GROUP BY u.id ORDER BY last_purchase DESC,u.id`;

export const GET = (req: Request) =>
  boundary(async () => {
    const host = await requireUser(req, true);
    const url = new URL(req.url);
    const { page, pageSize, offset } = readPage(url, 20);
    const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
    const db = database();
    const total = await db
      .prepare(
        `SELECT COUNT(DISTINCT u.id) total
         FROM users u
         JOIN reservations r ON r.user_id=u.id
         JOIN events e ON e.id=r.event_id
         WHERE e.host_id=?1 AND r.status='confirmed'
           AND (?2='' OR lower(u.name) LIKE '%'||lower(?2)||'%'
             OR lower(u.phone) LIKE '%'||lower(?2)||'%'
             OR EXISTS (
               SELECT 1 FROM reservations matched
               JOIN events matched_event ON matched_event.id=matched.event_id
               WHERE matched.user_id=u.id AND matched_event.host_id=?1
                 AND matched.status='confirmed'
                 AND (lower(COALESCE(matched.attendee_name,'')) LIKE '%'||lower(?2)||'%'
                   OR lower(COALESCE(matched.attendee_phone,'')) LIKE '%'||lower(?2)||'%')
             ))`,
      )
      .bind(host.id, q)
      .first<{ total: number }>();
    const rows = await db
      .prepare(customerQuery + " LIMIT ?3 OFFSET ?4")
      .bind(host.id, q, pageSize, offset)
      .all<Record<string, unknown>>();
    const customers = rows.results.map((row) => ({
      ...row,
      tags: parseTags(row.tags),
    }));
    const pagination = pageResult(customers, total?.total ?? 0, page, pageSize);
    return json({
      customers: pagination.items,
      total: pagination.total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: pagination.totalPages,
      query: q,
    });
  });

function parseTags(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

export const POST = (req: Request) =>
  boundary(async () => {
    sameOrigin(req);
    const host = await requireUser(req, true);
    await rateLimit(`host-customer:${host.id}`, 90);
    const data = await body(req);
    if (
      typeof data.userId !== "string" ||
      !data.userId ||
      data.userId.length > 80
    )
      throw new ApiError(400, faContent.invalidCustomerId);
    const notes = typeof data.notes === "string" ? data.notes.trim() : null;
    const tags = Array.isArray(data.tags)
      ? (data.tags as unknown[])
          .filter((tag: unknown): tag is string => typeof tag === "string")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : null;
    if (
      notes === null ||
      notes.length > 2000 ||
      tags === null ||
      tags.length > 12 ||
      tags.some((tag) => tag.length > 32)
    )
      throw new ApiError(400, faContent.invalidNoteTags);
    const db = database();
    const ownsCustomer = await db
      .prepare(
        "SELECT 1 ok FROM reservations r JOIN events e ON e.id=r.event_id WHERE e.host_id=? AND r.user_id=? AND r.status='confirmed' LIMIT 1",
      )
      .bind(host.id, data.userId)
      .first();
    if (!ownsCustomer) throw new ApiError(404, faContent.customerNotFound);
    await db
      .prepare(
        "INSERT INTO host_customer_metadata(host_id,user_id,notes,tags,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(host_id,user_id) DO UPDATE SET notes=excluded.notes,tags=excluded.tags,updated_at=excluded.updated_at",
      )
      .bind(
        host.id,
        data.userId,
        notes,
        JSON.stringify([...new Set(tags)]),
        Date.now(),
      )
      .run();
    return json({ ok: true });
  });
