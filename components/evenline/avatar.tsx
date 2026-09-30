"use client";
import { useRef, useState } from "react";
import { api } from "@/lib/client";
import { MAX_IMAGE_BYTES } from "@/lib/media-policy";
import { copy } from "@/locales/fa";
import { FigmaIcon } from "./source-icon";
import { ErrorState } from "./primitives";
export function Avatar({ name, src, large = false }: { name:string; src?:string|null; large?:boolean }) {
  return <span className={`el-avatar${large ? " el-avatar-large" : ""}`}>{src ? <img src={src} alt=""/> : <span aria-hidden="true">{name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join(" ")}</span>}</span>;
}
export function AvatarEditor({name,src,onChange}:{name:string;src:string|null;onChange:(url:string)=>void}) {
  const input=useRef<HTMLInputElement>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  return <><div className="el-avatar-editor"><button type="button" aria-label={copy.changeAvatar} aria-describedby="avatar-privacy" disabled={busy} aria-busy={busy} onClick={()=>input.current?.click()}><Avatar name={name} src={src}/><span className="el-avatar-camera"><FigmaIcon screen={45} name="camera"/></span></button><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden tabIndex={-1} aria-label={copy.changeAvatar} onChange={async event=>{
    const element=event.currentTarget,file=element.files?.[0];if(!file)return;
    setError("");if(!file.size || file.size>MAX_IMAGE_BYTES){setError(copy.avatarSizeInvalid);element.value="";return;}
    setBusy(true);
    try{const form=new FormData();form.set("data","{}");form.set("cover",file);const result=await api<{url:string}>("/api/profile/avatar",form);onChange(result.url);}
    catch(error){setError((error as Error).message);}finally{setBusy(false);element.value="";}
  }}/><span id="avatar-privacy" className="el-sr-only">{copy.avatarPublicHint}</span></div>{busy && <p role="status">{copy.avatarUploading}</p>}{error && <ErrorState message={error}/>}</>;
}
