import { database } from "@/db";
import { getEventProgram, validateProgram } from "@/lib/event-program";
import { requireHostEvent } from "@/lib/host-attendees";
import { boundary, json, sameOrigin, body, ApiError } from "@/lib/server";
import { copy } from "@/locales/fa";
type Context = {params:Promise<{id:string}>};
export const GET = (req:Request,context:Context)=>boundary(async()=>{
  const event=await requireHostEvent(req,(await context.params).id);
  return json({event,program:await getEventProgram(event.id)});
});
export const PUT = (req:Request,context:Context)=>boundary(async()=>{
  sameOrigin(req);
  const data=await body(req,32000);
  const event=await requireHostEvent(req,(await context.params).id);
  const program=validateProgram(data,event),db=database();
  if(program.series_id && !await db.prepare("SELECT id FROM event_series WHERE id=? AND host_id=?").bind(program.series_id,event.host_id).first()) throw new ApiError(400,copy.seriesInvalid);
  // One guarded statement keeps agenda, video and edition membership atomic and
  // rejects stale editor tabs without overwriting a newer revision.
  const row=await db.prepare(`INSERT INTO event_programs(event_id,series_id,video_url,agenda_json,revision)
    SELECT ?1,?2,?3,?4,1 WHERE (?5=0 OR EXISTS(SELECT 1 FROM event_programs WHERE event_id=?1 AND revision=?5))
      AND (?2 IS NULL OR EXISTS(SELECT 1 FROM event_series WHERE id=?2 AND host_id=?6))
    ON CONFLICT(event_id) DO UPDATE SET series_id=excluded.series_id,video_url=excluded.video_url,agenda_json=excluded.agenda_json,revision=event_programs.revision+1 WHERE event_programs.revision=?5
    RETURNING revision`).bind(event.id,program.series_id,program.video_url,JSON.stringify(program.agenda),program.revision,event.host_id).first<{revision:number}>();
  if(!row) throw new ApiError(409,copy.programConflict);
  return json({program:{...program,revision:row.revision}});
});
