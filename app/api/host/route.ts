import { decodeEvent } from "@/lib/event-schedule";
import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { eventSelect } from "@/lib/events";
import { readEventInput } from "@/lib/event-input";
import {
  ApiError,
  boundary,
  json,
  requireUser,
  sameOrigin,
  rateLimit,
} from "@/lib/server";
import {
  readEventSubmission,
  saveEventImages,
  cleanupEventImages,
  discardEventRequest,
} from "@/lib/event-media";
export const GET = (req: Request) =>
  boundary(async () => {
    const host = await requireUser(req, true);
    const db = database();
    const url = new URL(req.url);
    const pageValue = url.searchParams.get("page") ?? "0";
    if (!/^\d+$/.test(pageValue) || Number(pageValue) > 100000)
      throw new ApiError(400, faContent.invalidPageNumber);
    const page = Number(pageValue);
    const selected = url.searchParams.get("event") || "all";
    const [events, attendees, sales, totals, attendeeCount] = await db.batch([
      db
        .prepare(eventSelect + " WHERE e.host_id=?2 ORDER BY e.starts_at DESC")
        .bind(Date.now(), host.id),
      db
        .prepare(
          "SELECT r.id,r.event_id,r.quantity,r.total,r.status,r.created_at,r.reference,r.payment_state,e.sample,COALESCE(r.attendee_phone,u.phone) phone,COALESCE(r.attendee_name,u.name) name,e.title,e.starts_at,e.ends_at FROM reservations r JOIN events e ON e.id=r.event_id JOIN users u ON u.id=r.user_id WHERE e.host_id=?1 AND r.status IN ('confirmed','paid_unfulfilled') AND (?2='all' OR e.id=?2) ORDER BY r.created_at DESC,r.id LIMIT 50 OFFSET ?3",
        )
        .bind(host.id, selected, page * 50),
      db
        .prepare(
          "SELECT strftime('%Y-%m-%d',r.created_at/1000,'unixepoch','+3 hours','+30 minutes') day,SUM(CASE WHEN e.sample=0 AND r.payment_state<>'skipped_dev' THEN r.total ELSE 0 END) sales,SUM(r.quantity) tickets FROM reservations r JOIN events e ON e.id=r.event_id WHERE e.host_id=? AND r.status='confirmed' GROUP BY day ORDER BY day DESC LIMIT 30",
        )
        .bind(host.id),
      db
        .prepare(
          "SELECT COALESCE(SUM(CASE WHEN r.status='confirmed' AND e.sample=0 AND r.payment_state<>'skipped_dev' THEN r.total ELSE 0 END),0) revenue, COALESCE(SUM(CASE WHEN r.status='confirmed' THEN r.quantity ELSE 0 END),0) people, COALESCE(SUM(CASE WHEN r.status='confirmed' THEN 1 ELSE 0 END),0) bookings, COALESCE(SUM(CASE WHEN r.status='confirmed' AND (e.sample=1 OR r.payment_state='skipped_dev') THEN r.quantity ELSE 0 END),0) demoPeople, COALESCE(SUM(CASE WHEN r.status='confirmed' AND (e.sample=1 OR r.payment_state='skipped_dev') THEN 1 ELSE 0 END),0) demoBookings, COALESCE(SUM(CASE WHEN r.status='paid_unfulfilled' THEN 1 ELSE 0 END),0) paymentFollowups FROM reservations r JOIN events e ON e.id=r.event_id WHERE e.host_id=?",
        )
        .bind(host.id),
      db
        .prepare(
          "SELECT COUNT(*) total FROM reservations r JOIN events e ON e.id=r.event_id WHERE e.host_id=?1 AND r.status IN ('confirmed','paid_unfulfilled') AND (?2='all' OR e.id=?2)",
        )
        .bind(host.id, selected),
    ]);
    return json({
      events: (events.results as Record<string, unknown>[]).map(decodeEvent),
      attendees: attendees.results,
      sales: sales.results,
      stats: totals.results[0],
      attendeeTotal:
        (attendeeCount.results[0] as { total: number } | undefined)?.total ?? 0,
      page,
      serverNow: Date.now(),
    });
  });
export const POST = (req: Request) =>
  boundary(async () => {
    const host = await (async () => {
      try {
        sameOrigin(req);
        const user = await requireUser(req, true);
        await rateLimit("host-write:" + user.id, 100);
        return user;
      } catch (error) {
        await discardEventRequest(req);
        throw error;
      }
    })();
    const { data, uploads } = await readEventSubmission(req);
    const db = database();
    if (data.action === "publish") {
      if (uploads.length)
        throw new ApiError(400, faContent.statusImageRejected);
      if (typeof data.id !== "string" || typeof data.published !== "boolean")
        throw new ApiError(400, faContent.invalidInformation);
      const r = await db
        .prepare(
          "UPDATE events SET published=? WHERE id=? AND host_id=? RETURNING id",
        )
        .bind(data.published ? 1 : 0, data.id, host.id)
        .first();
      if (!r) throw new ApiError(404, faContent.eventNotFound);
      return json({ ok: true });
    }
    const { title, description, venue, address, city, category, start, end, registrationEnd, location, price, originalPrice, capacity } = readEventInput(data);
    const id = crypto.randomUUID();
    const media = await saveEventImages(id, uploads);
    try {
      await db.batch([
        db
          .prepare(
            "INSERT INTO events(id,host_id,title,description,category,venue,address,city,lat,lng,starts_at,ends_at,price,capacity,image,published,sample,created_at,maps_url,registration_ends_at,original_price) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,?,?,?,?)",
          )
          .bind(
            id,
            host.id,
            title,
            description,
            category,
            venue,
            address,
            city,
            location.lat,
            location.lng,
            start,
            end,
            price,
            capacity,
            media.coverUrl,
            Date.now(),
            location.url,
            registrationEnd,
            originalPrice,
          ),
        ...media.rows.map((row) =>
          db
            .prepare(
              "INSERT INTO event_media(id,event_id,role,position,storage_key,content_type,byte_size,created_at) VALUES(?,?,?,?,?,?,?,?)",
            )
            .bind(
              row.id,
              row.event_id,
              row.role,
              row.position,
              row.storage_key,
              row.content_type,
              row.byte_size,
              row.created_at,
            ),
        ),
      ]);
    } catch (error) {
      // A lost response may follow a successful commit. Never remove its images.
      let committed: { id: string } | null;
      try {
        committed = await db
          .prepare("SELECT id FROM events WHERE id=?")
          .bind(id)
          .first<{ id: string }>();
      } catch {
        console.error(
          "Event save outcome uncertain; preserve media for reconciliation",
          id,
        );
        throw error;
      }
      if (!committed) {
        await cleanupEventImages(media.rows);
        throw error;
      }
    }
    return json({ id }, 201);
  });
