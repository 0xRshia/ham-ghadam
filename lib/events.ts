import { database, config } from "@/db";
import { sampleEvents } from "./sample-events";
import type { EventItem, EventDetailData } from "./types";
export async function seedSamples() {
  if (config().SEED_SAMPLE_EVENTS !== "true") return;
  const db = database();
  if (await db.prepare("SELECT id FROM events WHERE sample=1 LIMIT 1").first())
    return;
  const rows = sampleEvents();
  await db.batch(
    rows.map((e) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO events(id,host_id,title,description,category,venue,address,city,lat,lng,starts_at,ends_at,price,capacity,image,published,sample,created_at,maps_url,registration_ends_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          e.id,
          e.host_id,
          e.title,
          e.description,
          e.category,
          e.venue,
          e.address,
          e.city,
          e.lat,
          e.lng,
          e.starts_at,
          e.ends_at,
          e.price,
          e.capacity,
          e.image,
          1,
          1,
          e.created_at,
          e.maps_url,
          e.registration_ends_at,
        ),
    ),
  );
}
export const eventThumbnail = `COALESCE(e.image,(SELECT '/api/media/' || id FROM event_media WHERE event_id=e.id AND role='gallery' ORDER BY position LIMIT 1))`;
export const eventSelect = `SELECT e.*, COALESCE((SELECT MIN(price) FROM event_ticket_tiers WHERE event_id=e.id AND active=1),e.price) minimum_price, ${eventThumbnail} thumbnail, COALESCE((SELECT SUM(quantity) FROM reservations WHERE event_id=e.id AND status='confirmed'),0) attendees, CASE WHEN e.capacity IS NULL THEN NULL ELSE MAX(0,e.capacity-COALESCE((SELECT SUM(quantity) FROM reservations WHERE event_id=e.id AND (status='confirmed' OR (status='hold' AND expires_at>?1))),0)) END remaining, CASE WHEN e.sample=0 THEN COALESCE((SELECT COUNT(*) FROM event_reviews er WHERE er.event_id=e.id AND er.status='published'),0) ELSE 0 END rating_count, CASE WHEN e.sample=0 THEN (SELECT AVG(er.rating) FROM event_reviews er WHERE er.event_id=e.id AND er.status='published') ELSE NULL END rating_average FROM events e`;
export async function getEvent(id: string) {
  return database()
    .prepare(eventSelect + " WHERE e.id=?2")
    .bind(Date.now(), id)
    .first<EventItem>();
}
export async function getEventDetail(id: string): Promise<EventDetailData | null> {
  const event = await getEvent(id);
  if (!event) return null;
  const gallery = await database().prepare(
    "SELECT id, '/api/media/' || id url FROM event_media WHERE event_id=? AND role='gallery' ORDER BY position",
  ).bind(id).all<{ id: string; url: string }>();
  return { ...event, gallery: gallery.results };
}
