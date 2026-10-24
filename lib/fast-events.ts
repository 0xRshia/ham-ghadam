import { database } from "@/db";
import { ApiError, isHost } from "@/lib/server";
import { getEventDetail } from "@/lib/events";
import { getEventProgram } from "@/lib/event-program";
import { getTicketTiers } from "@/lib/ticket-tiers";
import { readEventInput } from "@/lib/event-input";
import { cleanupEventImages, saveEventImages, type EventMediaRow, type ValidatedImage } from "@/lib/event-media";
import { MAX_EVENT_IMAGE_BYTES, MAX_GALLERY_IMAGES } from "@/lib/media-policy";
import type { FastEvent, FastOrganizer } from "@/lib/fast-types";
import { fastCopy } from "@/locales/fast-fa";
import { faContent } from "@/locales/domain-fa";
import { readEventOrganizer } from "@/lib/fast-organizer";
import { resolveEventOrganizer } from "@/lib/organizer-registry";

export async function fastOrganizers() {
  // The public organizer directory excludes hosts that have no published events.
  const { results } = await database().prepare(`SELECT o.id,COALESCE(NULLIF(u.name,''),o.name) name,COALESCE(u.phone,'') phone,
    o.user_id host_id,o.instagram_handle FROM organizers o LEFT JOIN users u ON u.id=o.user_id ORDER BY name,o.id`).all<FastOrganizer>();
  return results.filter(organizer => !organizer.host_id || isHost(organizer.phone));
}

export async function requireOrganizer(value: unknown) {
  if (typeof value !== "string") throw new ApiError(400, fastCopy.organizerInvalid);
  const user = await database().prepare("SELECT id,name,phone FROM users WHERE id=?").bind(value).first<FastOrganizer>();
  if (!user || !isHost(user.phone)) throw new ApiError(400, fastCopy.organizerInvalid);
  return user;
}

export async function fastEvent(id: string): Promise<FastEvent> {
  const event = await getEventDetail(id);
  if (!event) throw new ApiError(404, faContent.eventNotFound);
  const [history, program, ticketTiers] = await Promise.all([
    database().prepare("SELECT EXISTS(SELECT 1 FROM reservations WHERE event_id=?1) hasReservations,EXISTS(SELECT 1 FROM event_reviews WHERE event_id=?1) hasReviews").bind(id).first<{ hasReservations: number; hasReviews: number }>(),
    getEventProgram(id), getTicketTiers(id, true),
  ]);
  const identity = await database().prepare("SELECT instagram_handle FROM organizers WHERE id=?").bind(event.organizer_id ?? event.host_id).first<{ instagram_handle: string | null }>();
  return { ...event, organizer_instagram: identity?.instagram_handle ?? null, revision: (event as FastEvent).revision, program, ticketTiers,
    hasReservations: !!history?.hasReservations, canDelete: !history?.hasReservations && !history?.hasReviews };
}

export function editRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new ApiError(400, fastCopy.conflict);
  return Number(value);
}

async function selectMedia(id: string, data: Record<string, unknown>, uploads: ValidatedImage[], previous?: FastEvent) {
  const old = previous ? (await database().prepare("SELECT * FROM event_media WHERE event_id=? ORDER BY role,position").bind(id).all<EventMediaRow>()).results : [];
  const action = data.coverAction === undefined ? "keep" : data.coverAction;
  if (typeof action !== "string" || !["keep", "remove", "replace"].includes(action)) throw new ApiError(400, fastCopy.invalidMedia);
  const coverUpload = uploads.find(item => item.role === "cover");
  if ((action === "replace") !== !!coverUpload) throw new ApiError(400, fastCopy.invalidMedia);
  const galleryUploads = uploads.filter(item => item.role === "gallery");
  const manifest = data.galleryItems === undefined ? [...old.filter(item => item.role === "gallery").map(item => ({ mediaId: item.id })), ...galleryUploads.map((_, uploadIndex) => ({ uploadIndex }))] : data.galleryItems;
  if (!Array.isArray(manifest) || manifest.length > MAX_GALLERY_IMAGES) throw new ApiError(400, fastCopy.invalidMedia);
  const retained: EventMediaRow[] = action === "keep" ? old.filter(item => item.role === "cover") : [];
  const seen = new Set<string>();
  const selected: (EventMediaRow | ValidatedImage)[] = [];
  for (const [position, item] of manifest.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new ApiError(400, fastCopy.invalidMedia);
    let image: EventMediaRow | ValidatedImage | undefined;
    let key: string;
    if (typeof item.mediaId === "string" && item.uploadIndex === undefined) {
      key = item.mediaId;
      image = old.find(row => row.id === key && row.role === "gallery");
    } else if (Number.isInteger(item.uploadIndex) && item.mediaId === undefined) {
      key = `upload:${item.uploadIndex}`;
      image = galleryUploads[item.uploadIndex];
    } else throw new ApiError(400, fastCopy.invalidMedia);
    if (!image || seen.has(key)) throw new ApiError(400, fastCopy.invalidMedia);
    seen.add(key);
    selected.push({ ...image, position });
  }
  if (galleryUploads.some((_, index) => !seen.has(`upload:${index}`))) throw new ApiError(400, fastCopy.invalidMedia);
  const combined = [...retained, ...(coverUpload ? [coverUpload] : []), ...selected];
  if (combined.reduce((total, item) => total + ("byte_size" in item ? item.byte_size : item.bytes.byteLength), 0) > MAX_EVENT_IMAGE_BYTES)
    throw new ApiError(413, faContent.totalImagesLimit);
  const media = await saveEventImages(id, [...(coverUpload ? [coverUpload] : []), ...selected.filter((item): item is ValidatedImage => "bytes" in item)]);
  const rows = [...retained, ...selected.filter((item): item is EventMediaRow => "storage_key" in item), ...media.rows];
  const image = action === "keep" ? previous?.image ?? null : action === "remove" ? null : media.coverUrl;
  return { rows, newRows: media.rows, image };
}

function mediaInsert(row: EventMediaRow) {
  return database().prepare("INSERT INTO event_media(id,event_id,role,position,storage_key,content_type,byte_size,created_at) VALUES(?,?,?,?,?,?,?,?)")
    .bind(row.id, row.event_id, row.role, row.position, row.storage_key, row.content_type, row.byte_size, row.created_at);
}

export async function saveFastEvent(data: Record<string, unknown>, uploads: ValidatedImage[], id?: string) {
  const previous = id ? await fastEvent(id) : undefined;
  const revision = previous ? editRevision(data.revision) : 0;
  if (previous && revision !== previous.revision) throw new ApiError(409, fastCopy.conflict);
  const input = readEventInput(data, previous);
  const organizerInput = readEventOrganizer(data);
  if (!organizerInput) throw new ApiError(400, fastCopy.organizerInvalid);
  if (organizerInput.host_id && organizerInput.host_id !== previous?.host_id) await requireOrganizer(organizerInput.host_id);
  const organizer = await resolveEventOrganizer(data, organizerInput);
  if (data.published !== undefined && typeof data.published !== "boolean") throw new ApiError(400, faContent.invalidInformation);
  const published = data.published ?? (previous ? !!previous.published : false);
  const eventId = id ?? crypto.randomUUID();
  const db = database();
  const media = await selectMedia(eventId, data, uploads, previous);
  const values = [organizer.host_id,input.title,input.description,input.category,input.venue,input.address,input.city,input.location.lat,input.location.lng,input.location.url,input.start,input.end,input.registrationEnd,input.price,input.capacity,media.image,published ? 1 : 0];
  try {
    const statements = previous ? [
      // A failed guard assigns NULL to a NOT NULL revision, aborting the whole
      // batch, including media changes. The checks run atomically with bookings.
      db.prepare(`UPDATE events SET host_id=?1,organizer_name=?21,organizer_id=?22,title=?2,description=?3,category=?4,venue=?5,address=?6,city=?7,lat=?8,lng=?9,maps_url=?10,starts_at=?11,ends_at=?12,registration_ends_at=?13,price=?14,capacity=?15,image=?16,published=?17,
        revision=CASE WHEN revision=?18
        AND (?15 IS NULL OR ?15>=COALESCE((SELECT SUM(quantity) FROM reservations WHERE event_id=events.id AND (status='confirmed' OR (status='hold' AND expires_at>?20))),0))
        AND (NOT EXISTS(SELECT 1 FROM reservations WHERE event_id=events.id) OR (host_id IS ?1 AND organizer_name IS ?21 AND (organizer_id IS ?22 OR organizer_id IS NULL) AND venue=?5 AND address=?6 AND city=?7 AND lat IS ?8 AND lng IS ?9 AND maps_url IS ?10 AND starts_at=?11 AND ends_at=?12))
        AND NOT EXISTS(SELECT 1 FROM event_programs p,json_each(p.agenda_json) j WHERE p.event_id=events.id AND (json_extract(j.value,'$.starts_at')<?11 OR json_extract(j.value,'$.ends_at')>?12))
        THEN revision+1 ELSE NULL END WHERE id=?19 RETURNING id`)
        .bind(...values,revision,eventId,Date.now(),organizer.organizer_name,organizer.organizer_id),
      db.prepare("DELETE FROM event_media WHERE event_id=?").bind(eventId),
      ...media.rows.map(mediaInsert),
      ...(organizer.host_id !== previous.host_id || organizer.organizer_id !== (previous.organizer_id ?? previous.host_id) ? [
        db.prepare("UPDATE event_programs SET series_id=NULL,revision=revision+1 WHERE event_id=?").bind(eventId),
        db.prepare("DELETE FROM event_scanners WHERE event_id=?").bind(eventId),
      ] : []),
    ] : [
      db.prepare("INSERT INTO events(host_id,title,description,category,venue,address,city,lat,lng,maps_url,starts_at,ends_at,registration_ends_at,price,capacity,image,published,id,sample,created_at,organizer_name,organizer_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,(SELECT CASE WHEN user_id IS NULL THEN name ELSE NULL END FROM organizers WHERE id=?),?) RETURNING id")
        .bind(...values,eventId,Date.now(),organizer.organizer_id,organizer.organizer_id),
      ...media.rows.map(mediaInsert),
    ];
    const result = await db.batch([...organizer.statements, ...statements]);
    if (!result[organizer.statements.length].results.length) throw new ApiError(404, faContent.eventNotFound);
  } catch (error) {
    // A lost response can follow a committed write. Only remove new objects
    // when an unchanged revision proves this transaction did not commit.
    try {
      const current = await db.prepare("SELECT revision FROM events WHERE id=?").bind(eventId).first<{ revision: number }>();
      if ((!previous && !current) || (previous && current?.revision === revision)) await cleanupEventImages(media.newRows);
      else if ((!previous && current) || (previous && current?.revision === revision + 1 && media.newRows.length &&
        (await db.prepare("SELECT COUNT(*) count FROM event_media WHERE event_id=?1 AND id IN (SELECT value FROM json_each(?2))")
          .bind(eventId,JSON.stringify(media.newRows.map(row => row.id))).first<{ count: number }>())?.count === media.newRows.length)) return fastEvent(eventId);
    } catch {
      console.error("Admin event outcome uncertain; preserve uploaded images", eventId);
    }
    if (String(error).includes("NOT NULL constraint failed: events.revision")) throw new ApiError(409, fastCopy.conflict);
    if (/UNIQUE constraint failed: organizers\.|NOT NULL constraint failed: organizers\.name/.test(String(error)))
      throw new ApiError(409, "پروفایل برگزارکننده هم‌زمان تغییر کرده است؛ اطلاعات تازه را دریافت و همان پروفایل را انتخاب کنید.");
    throw error;
  }
  return fastEvent(eventId);
}
