import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { boundary, requireUser } from "@/lib/server";

export const GET = (req: Request) =>
  boundary(async () => {
    const host = await requireUser(req, true);
    const q = (new URL(req.url).searchParams.get("q") || "")
      .trim()
      .slice(0, 100);
    const rows = await database()
      .prepare(
        `
    SELECT u.name,u.phone,(SELECT COALESCE(latest.attendee_name,u.name) FROM reservations latest JOIN events latest_event ON latest_event.id=latest.event_id WHERE latest.user_id=u.id AND latest_event.host_id=?1 AND latest.status='confirmed' ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1) booking_name,
      COUNT(DISTINCT r.id) purchase_count,
      COUNT(DISTINCT CASE WHEN e.sample=1 OR r.payment_state='skipped_dev' THEN r.id END) demo_count,
      COALESCE(SUM(CASE WHEN e.sample=0 AND r.payment_state='paid' THEN r.total ELSE 0 END),0) spend,
      MAX(r.created_at) last_purchase,COALESCE(m.notes,'') notes,COALESCE(m.tags,'[]') tags
    FROM users u JOIN reservations r ON r.user_id=u.id JOIN events e ON e.id=r.event_id
    LEFT JOIN host_customer_metadata m ON m.host_id=?1 AND m.user_id=u.id
    WHERE e.host_id=?1 AND r.status='confirmed'
      AND (?2='' OR lower(u.name) LIKE '%'||lower(?2)||'%' OR lower(u.phone) LIKE '%'||lower(?2)||'%' OR EXISTS(
        SELECT 1 FROM reservations matched JOIN events matched_event ON matched_event.id=matched.event_id
        WHERE matched.user_id=u.id AND matched_event.host_id=?1 AND matched.status='confirmed'
          AND (lower(COALESCE(matched.attendee_name,'')) LIKE '%'||lower(?2)||'%' OR lower(COALESCE(matched.attendee_phone,'')) LIKE '%'||lower(?2)||'%')
      ))
    GROUP BY u.id ORDER BY last_purchase DESC,u.id
  `,
      )
      .bind(host.id, q)
      .all<Record<string, unknown>>();
    const cell = (value: unknown) =>
      '"' +
      String(value ?? "")
        .replace(/^[\s\u0000-\u001f]*[=+@-]/, "'$&")
        .replace(/"/g, '""') +
      '"';
    const rowsToWrite = [
      [
        faContent.accountName,
        faContent.mobile,
        faContent.bookingName,
        faContent.confirmedBookingCount,
        faContent.testRecords,
        faContent.actualPaidToman,
        faContent.lastPurchase,
        faContent.note,
        faContent.tags,
      ],
      ...rows.results.map((row) => [
        row.name,
        row.phone,
        row.booking_name,
        row.purchase_count,
        row.demo_count,
        row.spend,
        row.last_purchase,
        row.notes,
        row.tags,
      ]),
    ];
    const csv =
      "\uFEFF" + rowsToWrite.map((row) => row.map(cell).join(",")).join("\r\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": 'attachment; filename="hamghadam-customers.csv"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
