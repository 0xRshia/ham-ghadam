import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { ApiError, boundary, body, json, randomToken, rateLimit, requireUser, sameOrigin } from "@/lib/server";
import { requireHostEvent } from "@/lib/host-attendees";

export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  boundary(async () => {
    sameOrigin(req);
    const { id } = await params;
    await requireHostEvent(req, id);
    const host = await requireUser(req, true);
    await rateLimit("scanner-link:" + host.id, 100);
    const data = await body(req);
    if (data.action !== undefined && data.action !== "rotate")
      throw new ApiError(400, faContent.invalidRequest);
    const db = database();
    await db.prepare(`INSERT INTO event_scanners(event_id,token,created_at) SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM events WHERE id=?1 AND host_id=?4)
      ON CONFLICT(event_id) ${data.action === "rotate" ? "DO UPDATE SET token=excluded.token,created_at=excluded.created_at" : "DO NOTHING"}`)
      .bind(id, randomToken(), Date.now(), host.id).run();
    const scanner = await db.prepare("SELECT s.token FROM event_scanners s JOIN events e ON e.id=s.event_id WHERE s.event_id=? AND e.host_id=?").bind(id, host.id).first<{ token: string }>();
    if (!scanner) throw new ApiError(404, faContent.eventNotFound);
    return json({ scannerUrl: `/scanner#${scanner.token}` });
  });
