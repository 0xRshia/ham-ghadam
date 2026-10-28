import { database } from "@/db";
import { imageResponse } from "@/lib/image-response";
import { IMAGE_MIME_TYPES, type ImageMimeType } from "@/lib/media-policy";
import { ApiError, boundary } from "@/lib/server";
import { copy } from "@/locales/fa";
export const GET = (req:Request,{params}:{params:Promise<{id:string}>}) => boundary(async()=>{
  const {id}=await params;
  const media=await database().prepare("SELECT storage_key,content_type,byte_size FROM profile_media WHERE id=?").bind(id).first<{storage_key:string;content_type:ImageMimeType;byte_size:number}>();
  if(!media || !IMAGE_MIME_TYPES.includes(media.content_type))throw new ApiError(404,copy.avatarNotFound);
  return imageResponse(req, media, "revalidate");
});
