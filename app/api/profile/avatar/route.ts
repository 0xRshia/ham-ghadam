import { database } from "@/db";
import { deleteMedia, writeMedia } from "@/lib/media-storage";
import { discardEventRequest, readEventSubmission } from "@/lib/event-media";
import { ApiError, boundary, json, rateLimit, requireUser, sameOrigin } from "@/lib/server";
import { copy } from "@/locales/fa";
export const POST = (req: Request) => boundary(async () => {
  let user:Awaited<ReturnType<typeof requireUser>>;
  try {
    sameOrigin(req);user=await requireUser(req);
    await rateLimit(`profile-avatar:${user.id}`,10,1000);
  } catch(error) {await discardEventRequest(req);throw error;}
  const {uploads}=await readEventSubmission(req);
  if(uploads.length!==1 || uploads[0].role!=="cover") throw new ApiError(400,copy.avatarRequired);
  const upload=uploads[0],id=crypto.randomUUID(),now=Date.now();
  const extension={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}[upload.contentType];
  const storageKey=`${id}.${extension}`,url=`/api/profile-media/${id}`;
  await writeMedia(storageKey,upload.bytes,upload.contentType);
  const db=database();
  try {
    await db.batch([
      db.prepare("INSERT INTO profile_media(id,user_id,storage_key,content_type,byte_size,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET id=excluded.id,storage_key=excluded.storage_key,content_type=excluded.content_type,byte_size=excluded.byte_size,created_at=excluded.created_at")
        .bind(id,user.id,storageKey,upload.contentType,upload.bytes.byteLength,now),
      db.prepare("INSERT INTO user_profiles(user_id,avatar_url,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET avatar_url=excluded.avatar_url,updated_at=excluded.updated_at").bind(user.id,url,now),
    ]);
  } catch(error) {
    await deleteMedia(storageKey).catch(()=>console.error("Profile image cleanup failed"));throw error;
  }
  // Old objects remain immutable for in-flight database/media snapshots.
  return json({url},201);
});
export const DELETE = (req: Request) => boundary(async () => {
  sameOrigin(req);const user=await requireUser(req),db=database();
  const media=await db.prepare("SELECT id FROM profile_media WHERE user_id=?").bind(user.id).first<{id:string}>();
  if (media) await db.batch([
    db.prepare("UPDATE user_profiles SET avatar_url=NULL,updated_at=? WHERE user_id=? AND avatar_url=?").bind(Date.now(),user.id,`/api/profile-media/${media.id}`),
    db.prepare("DELETE FROM profile_media WHERE id=? AND user_id=?").bind(media.id,user.id),
  ]);
  return json({ok:true});
});
