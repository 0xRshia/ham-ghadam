import { database } from "@/db";
import { readMedia } from "@/lib/media-storage";
import { IMAGE_MIME_TYPES, type ImageMimeType } from "@/lib/media-policy";
import { ApiError, boundary } from "@/lib/server";
import { copy } from "@/locales/fa";
export const GET = (_req:Request,{params}:{params:Promise<{id:string}>}) => boundary(async()=>{
  const {id}=await params;
  const media=await database().prepare("SELECT storage_key,content_type,byte_size FROM profile_media WHERE id=?").bind(id).first<{storage_key:string;content_type:ImageMimeType;byte_size:number}>();
  if(!media || !IMAGE_MIME_TYPES.includes(media.content_type))throw new ApiError(404,copy.avatarNotFound);
  const bytes=await readMedia(media.storage_key);
  if(!bytes)throw new ApiError(404,copy.avatarNotFound);
  return new Response(bytes,{headers:{"Content-Type":media.content_type,"Content-Length":String(media.byte_size),"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"}});
});
