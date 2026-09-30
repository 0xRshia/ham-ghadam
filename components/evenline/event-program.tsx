"use client";
import { useEffect,useRef,useState, type CSSProperties } from "react";
import { clock,faDigits,type AgendaItem } from "@/lib/types";
import { copy } from "@/locales/fa";
import { Avatar } from "./avatar";
import { FigmaIcon } from "./source-icon";
export function EventAgenda({items}:{items:AgendaItem[]}) {
  if(!items.length)return null;
  return <section className="el-agenda"><h2>{copy.agenda}</h2><div className="el-agenda-list">{items.map(item=><article className="el-agenda-card" key={item.id}><Avatar name={item.speaker} src={item.image_url}/><h3 title={item.title}>{item.title}</h3><p title={item.speaker}>{item.speaker}</p><div className="el-agenda-time"><FigmaIcon screen={21} name="clock"/><time dateTime={new Date(item.starts_at).toISOString()}>{clock(item.starts_at)} – {clock(item.ends_at)}</time></div></article>)}</div></section>;
}
const elapsed=(seconds:number)=>faDigits(`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,"0")}`);
export function EventVideo({url,title,poster,onClose}:{url:string;title:string;poster:string|null;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),video=useRef<HTMLVideoElement>(null),surface=useRef<HTMLDivElement>(null);
  const [playing,setPlaying]=useState(false),[muted,setMuted]=useState(false),[duration,setDuration]=useState(0),[time,setTime]=useState(0),[error,setError]=useState("");
  useEffect(()=>{dialog.current?.showModal();const current=video.current;return()=>{current?.pause();};},[]);
  async function toggle(){const current=video.current;if(!current)return;setError("");if(current.paused){try{await current.play();}catch{setError(copy.videoUnavailable);}}else current.pause();}
  return <dialog ref={dialog} className="el-video-player" aria-label={title} onCancel={onClose} onClose={onClose}><div ref={surface} className="el-video-surface">
    <video ref={video} src={url} poster={poster??undefined} playsInline preload="metadata" onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onLoadedMetadata={event=>setDuration(Number.isFinite(event.currentTarget.duration)?event.currentTarget.duration:0)} onDurationChange={event=>setDuration(Number.isFinite(event.currentTarget.duration)?event.currentTarget.duration:0)} onTimeUpdate={event=>setTime(event.currentTarget.currentTime)} onVolumeChange={event=>setMuted(event.currentTarget.muted)} onError={()=>setError(copy.videoUnavailable)}/>
    <header><button className="el-icon-button" aria-label={copy.close} onClick={onClose}><FigmaIcon screen={22} name="x"/></button><h2>{title}</h2></header>
    {!playing&&<button className="el-video-play" aria-label={copy.playVideo} onClick={()=>void toggle()}><FigmaIcon screen={22} name="player-play" size={40}/></button>}
    <div className="el-video-controls"><button className="el-icon-button" aria-label={playing?copy.pauseVideo:copy.playVideo} onClick={()=>void toggle()}>{playing?<span className="el-video-pause" aria-hidden="true"/>:<FigmaIcon screen={22} name="player-play"/>}</button><input style={{"--el-progress":`${duration ? Math.min(100,time/duration*100) : 0}%`} as CSSProperties} type="range" dir="ltr" min={0} max={duration||1} step={0.1} value={Math.min(time,duration||1)} disabled={!duration} aria-label={copy.videoProgress} aria-valuetext={`${elapsed(time)} / ${elapsed(duration)}`} onChange={event=>{const next=Number(event.target.value);setTime(next);if(video.current)video.current.currentTime=next;}}/><bdi dir="ltr">{elapsed(time)} / {elapsed(duration)}</bdi><button className="el-icon-button" aria-label={muted?copy.unmuteVideo:copy.muteVideo} aria-pressed={muted} onClick={()=>{if(video.current)video.current.muted=!video.current.muted;}}><FigmaIcon screen={22} name="volume-high"/></button><button className="el-icon-button" aria-label={copy.fullscreen} onClick={async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(surface.current?.requestFullscreen)await surface.current.requestFullscreen();else setError(copy.fullscreenUnavailable);}catch{setError(copy.fullscreenUnavailable);}}}><FigmaIcon screen={22} name="minimize"/></button></div>
    {error&&<p className="el-video-error" role="alert">{error}</p>}
  </div></dialog>;
}
