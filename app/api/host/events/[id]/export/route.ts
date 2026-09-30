import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { boundary } from "@/lib/server";
import { attendeeFrom, attendeeName, attendeePhone, attendeeSearch, attendeeWhere, csvCell, requireHostEvent } from "@/lib/host-attendees";

export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  boundary(async () => {
    const { id } = await params;
    await requireHostEvent(req, id);
    const { query, namePattern, phonePattern } = attendeeSearch(req);
    const { results } = await database().prepare(`SELECT ${attendeeName} name,${attendeePhone} phone
      ${attendeeFrom} ${attendeeWhere} ORDER BY r.created_at DESC,r.id`)
      .bind(id, query, namePattern, phonePattern).all<{ name: string; phone: string }>();
    const csv = "\uFEFF" + [faContent.attendeeCsvHeader, ...results.map((r) => `${csvCell(r.name)},${csvCell(r.phone)}`)].join("\r\n") + "\r\n";
    return new Response(csv, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendees-${encodeURIComponent(id)}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  });
