import { database } from "@/db";
import { ApiError } from "@/lib/server";
import { copy } from "@/locales/fa";
export async function listEventSeries(hostId: string) {
  return (await database().prepare("SELECT id,title FROM event_series WHERE host_id=? ORDER BY created_at DESC,id LIMIT 100").bind(hostId).all<{id: string; title: string}>()).results;
}
export async function createEventSeries(hostId: string, data: Record<string, unknown>) {
  if(typeof data.title!=="string" || data.title.trim().length<2 || data.title.length>100) throw new ApiError(400,copy.seriesInvalid);
  const id=crypto.randomUUID();
  const row=await database().prepare("INSERT INTO event_series(id,host_id,title,created_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM event_series WHERE host_id=?)<100 RETURNING id,title").bind(id,hostId,data.title.trim(),Date.now(),hostId).first();
  if(!row) throw new ApiError(409,copy.seriesLimit);
  return row;
}
