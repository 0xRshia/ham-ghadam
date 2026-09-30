import { config, database } from "@/db";
import { ApiError } from "@/lib/server";
import { eventSelect } from "@/lib/events";
import type { AgendaItem, EventEdition, EventItem, EventProgram } from "@/lib/types";
import { copy } from "@/locales/fa";

type ProgramRow = { video_url: string | null; series_id: string | null; agenda_json: string; revision: number };
export async function getEventProgram(eventId: string): Promise<EventProgram> {
  const row = await database().prepare("SELECT video_url,series_id,agenda_json,revision FROM event_programs WHERE event_id=?").bind(eventId).first<ProgramRow>();
  return row ? {video_url:row.video_url,series_id:row.series_id,agenda:JSON.parse(row.agenda_json) as AgendaItem[],revision:row.revision} : {video_url:null,series_id:null,agenda:[],revision:0};
}
export async function getEventEditions(event: EventItem): Promise<EventEdition[]> {
  const {results} = await database().prepare(eventSelect + ` WHERE e.host_id=?2 AND e.published=1 AND (e.sample=0 OR ?3=1) AND e.ends_at>?1 AND e.id IN (
    SELECT other.event_id FROM event_programs current JOIN event_series s ON s.id=current.series_id AND s.host_id=?2 JOIN event_programs other ON other.series_id=s.id WHERE current.event_id=?4
  ) ORDER BY e.starts_at,e.id LIMIT 100`).bind(Date.now(),event.host_id,config().SEED_SAMPLE_EVENTS !== "true" ? 0 : 1,event.id).all<EventItem>();
  return results.map(({id,title,starts_at,ends_at,registration_ends_at,remaining,price,minimum_price})=>({id,title,starts_at,ends_at,registration_ends_at,remaining,price,minimum_price}));
}
function mediaUrl(value: unknown, localImage = false) {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length>2048 || /[\s\u0000-\u001f]/.test(value)) throw new ApiError(400,copy.programMediaInvalid);
  if (localImage && /^\/api\/(?:profile-media|media)\/[\w-]{1,80}$/.test(value)) return value;
  try {
    const url = new URL(value);
    // Media is loaded directly by the browser; the server never fetches host URLs.
    if (url.protocol!=="https:" || url.username || url.password || url.port || !url.hostname.includes(".") || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local") || /^\d+(\.\d+){3}$/.test(url.hostname)) throw new Error();
    return url.href;
  } catch {throw new ApiError(400,copy.programMediaInvalid);}
}
export function validateProgram(data: Record<string,unknown>, event: Pick<EventItem,"starts_at"|"ends_at">): EventProgram {
  if (!Number.isSafeInteger(data.revision) || Number(data.revision)<0 || !Array.isArray(data.agenda) || data.agenda.length>24) throw new ApiError(400,copy.programInvalid);
  if (data.series_id !== null && (typeof data.series_id!=="string" || !/^[\w-]{1,80}$/.test(data.series_id))) throw new ApiError(400,copy.programInvalid);
  const seen = new Set<string>();
  const agenda = data.agenda.map((input:unknown) => {
    if (!input || typeof input!=="object" || Array.isArray(input)) throw new ApiError(400,copy.programInvalid);
    const item=input as Record<string,unknown>;
    if (typeof item.id!=="string" || !/^[\w-]{1,80}$/.test(item.id) || seen.has(item.id) || typeof item.title!=="string" || !item.title.trim() || item.title.length>100 || typeof item.speaker!=="string" || !item.speaker.trim() || item.speaker.length>80 || !Number.isSafeInteger(item.starts_at) || !Number.isSafeInteger(item.ends_at) || Number(item.starts_at)<event.starts_at || Number(item.ends_at)>event.ends_at || Number(item.ends_at)<=Number(item.starts_at)) throw new ApiError(400,copy.programInvalid);
    seen.add(item.id);
    return {id:item.id,title:item.title.trim(),speaker:item.speaker.trim(),image_url:mediaUrl(item.image_url,true),starts_at:Number(item.starts_at),ends_at:Number(item.ends_at)};
  }).sort((a,b)=>a.starts_at-b.starts_at || a.id.localeCompare(b.id));
  return {video_url:mediaUrl(data.video_url),series_id:data.series_id as string|null,agenda,revision:Number(data.revision)};
}
