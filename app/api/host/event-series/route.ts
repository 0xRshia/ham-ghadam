import { database } from "@/db";
import { boundary,json,requireUser,sameOrigin,body,ApiError } from "@/lib/server";
import { copy } from "@/locales/fa";
export const GET=(req:Request)=>boundary(async()=>{
  const user=await requireUser(req,true);
  const {results}=await database().prepare("SELECT id,title FROM event_series WHERE host_id=? ORDER BY created_at DESC,id LIMIT 100").bind(user.id).all();
  return json({series:results});
});
export const POST=(req:Request)=>boundary(async()=>{
  sameOrigin(req);const data=await body(req);const user=await requireUser(req,true);
  if(typeof data.title!=="string" || data.title.trim().length<2 || data.title.length>100) throw new ApiError(400,copy.seriesInvalid);
  const id=crypto.randomUUID();
  const row=await database().prepare("INSERT INTO event_series(id,host_id,title,created_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM event_series WHERE host_id=?)<100 RETURNING id,title").bind(id,user.id,data.title.trim(),Date.now(),user.id).first();
  if(!row) throw new ApiError(409,copy.seriesLimit);
  return json({series:row},201);
});
