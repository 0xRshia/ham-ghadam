import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { ApiError, boundary, json, requireUser } from "@/lib/server";
export const GET = (
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) =>
  boundary(async () => {
    const host = await requireUser(req, true);
    const { userId } = await params;
    const db = database();
    const customer = await db
      .prepare(
        "SELECT u.id user_id,u.name,u.phone,COALESCE(m.notes,'') notes,COALESCE(m.tags,'[]') tags FROM users u LEFT JOIN host_customer_metadata m ON m.host_id=? AND m.user_id=u.id WHERE u.id=? AND EXISTS(SELECT 1 FROM reservations r JOIN events e ON e.id=r.event_id WHERE r.user_id=u.id AND e.host_id=? AND r.status='confirmed')",
      )
      .bind(host.id, userId, host.id)
      .first<Record<string, unknown>>();
    if (!customer) throw new ApiError(404, faContent.customerNotFound);
    const history = await db
      .prepare(
        "SELECT r.id,r.event_id,e.title,e.starts_at,r.created_at,r.quantity,r.total,r.payment_state,r.attendee_name,r.attendee_phone,e.sample,CASE WHEN e.sample=1 OR r.payment_state='skipped_dev' THEN 1 ELSE 0 END is_demo FROM reservations r JOIN events e ON e.id=r.event_id WHERE r.user_id=? AND e.host_id=? AND r.status='confirmed' ORDER BY r.created_at DESC,r.id DESC",
      )
      .bind(userId, host.id)
      .all();
    let tags: string[] = [];
    try {
      const parsed = JSON.parse(String(customer.tags));
      if (Array.isArray(parsed))
        tags = parsed.filter((tag): tag is string => typeof tag === "string");
    } catch {}
    return json({ customer: { ...customer, tags }, history: history.results });
  });
