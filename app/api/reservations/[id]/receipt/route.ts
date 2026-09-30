import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { ApiError, boundary, json, requireUser } from "@/lib/server";
import type { ReceiptResponse } from "@/lib/account-types";

export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  boundary(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    const receipt = await database().prepare(`SELECT
        r.id,r.event_id,r.quantity,r.total,r.status,r.payment_state,r.reference,r.created_at,r.expires_at,
        COALESCE(r.attendee_name,u.name) name,COALESCE(r.attendee_phone,u.phone) phone,
        e.title,e.venue,e.address,e.city,e.starts_at,e.ends_at
      FROM reservations r JOIN events e ON e.id=r.event_id JOIN users u ON u.id=r.user_id
      WHERE r.id=? AND r.user_id=?`)
      .bind(id, user.id).first<ReceiptResponse["receipt"]>();
    if (!receipt) throw new ApiError(404, faContent.receiptNotFound);
    return json({ receipt, serverNow: Date.now() });
  });
