"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Link as LinkIcon, Mail, RefreshCw, Share2, X } from "lucide-react";
import { scheduleDateLabel, scheduleTimeLabel } from "@/lib/event-schedule";
import { eventShareUrl, eventStoryFilename, renderEventStory } from "@/lib/event-story";
import type { EventDetailData } from "@/lib/types";
import { copy } from "@/locales/fa";
import { eventShareCopy as text } from "@/locales/event-share-fa";
import { SourceIcon } from "./primitives";

function cancelled(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function downloadStory(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Mount when sharing opens so native dialog focus returns to the trigger. */
export function EventShare({ event, onClose }: { event: EventDetailData; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const hintId = useId();
  const [shareUrl] = useState(() => typeof window === "undefined" ? "" : eventShareUrl(event.id, window.location.origin));
  const [story, setStory] = useState<{ blob: Blob; preview: string; file: File; hasCover: boolean; native: boolean } | null>(null);
  const [failure, setFailure] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const source = useMemo(() => ({
    title: event.title,
    image: event.image || event.thumbnail || null,
    date: scheduleDateLabel(event, true),
    time: scheduleTimeLabel(event),
    place: [...new Set([event.venue, event.city].filter(Boolean))].join("، "),
    url: shareUrl,
  }), [event, shareUrl]);

  useEffect(() => {
    const current = dialog.current;
    if (current && !current.open) current.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      current?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let preview = "";
    void renderEventStory(source, controller.signal).then(({ blob, hasCover }) => {
      if (controller.signal.aborted) return;
      preview = URL.createObjectURL(blob);
      const file = new File([blob], eventStoryFilename(event.id), { type: "image/png" });
      let native = false;
      try { native = typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }); } catch { /* Download remains available. */ }
      setStory({ blob, preview, file, hasCover, native });
    }).catch(error => { if (!cancelled(error) && !controller.signal.aborted) setFailure(true); });
    return () => { controller.abort(); if (preview) URL.revokeObjectURL(preview); };
  }, [source, event.id, attempt]);

  async function copyLink() {
    setMessage("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setMessage(text.copied);
    } catch {
      linkInput.current?.focus();
      linkInput.current?.select();
      setMessage(text.copyFailed);
    }
  }

  async function shareImage() {
    if (!story || busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (story.native) {
        // Sending the file alone avoids platforms silently choosing a link preview.
        await navigator.share({ files: [story.file], title: event.title });
        setMessage(text.imageShared);
      } else {
        downloadStory(story.blob, story.file.name);
        setMessage(text.imageDownloaded);
      }
    } catch (error) { setMessage(cancelled(error) ? text.cancelled : text.imageShareFailed); }
    finally { setBusy(false); }
  }

  async function shareLink() {
    if (busy) return;
    if (!navigator.share) { await copyLink(); return; }
    setBusy(true);
    setMessage("");
    try { await navigator.share({ title: event.title, url: shareUrl }); setMessage(text.linkShared); }
    catch (error) { setMessage(cancelled(error) ? text.cancelled : text.linkShareFailed); }
    finally { setBusy(false); }
  }

  return <dialog ref={dialog} className="el-event-share" aria-labelledby={titleId} aria-describedby={hintId} onCancel={onClose} onClose={onClose} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); } }}>
    <div className="el-event-share-handle" aria-hidden="true" />
    <header className="el-event-share-heading"><div><p>{text.story}</p><h2 id={titleId}>{text.title}</h2></div><button type="button" className="el-icon-button" aria-label={copy.close} onClick={onClose} autoFocus><X size={24} aria-hidden="true" /></button></header>
    <div className="el-event-share-content">
      <figure className="el-event-share-preview" aria-busy={!story && !failure}>
        {story ? <img src={story.preview} alt={`${text.preview}؛ ${event.title}، ${source.date}، ${source.place}`} width={1080} height={1920} /> : <div className="el-event-share-placeholder"><img src="/brand/hamghadam-wordmark.svg" alt="" width={120} height={50} /><p role="status">{failure ? text.previewFailed : text.previewLoading}</p>{failure && <button type="button" className="el-button el-button-secondary" onClick={() => { setFailure(false); setStory(null); setAttempt(value => value + 1); }}><RefreshCw size={16} aria-hidden="true" />{text.retry}</button>}</div>}
      </figure>
      {story && !story.hasCover && source.image && <p className="el-event-share-note">{text.missingCover}</p>}
      <div className="el-event-share-image-actions"><button type="button" className="el-button el-button-primary" disabled={!story || busy} onClick={() => void shareImage()}>{story?.native ? <SourceIcon asset={{ src: "/icons/instagram.svg", width: 22, height: 22 }} size={22} /> : <Download size={20} aria-hidden="true" />}{story?.native ? text.shareImage : text.download}</button>{story?.native && <button type="button" className="el-event-share-download" aria-label={text.download} disabled={busy} onClick={() => { downloadStory(story.blob, story.file.name); setMessage(text.imageDownloaded); }}><Download size={22} aria-hidden="true" /></button>}</div>
      <p id={hintId} className="el-event-share-hint">{story?.native ? text.nativeHint : text.storyHint}</p>
      <div className="el-event-share-url"><LinkIcon size={18} aria-hidden="true" /><input ref={linkInput} type="text" dir="ltr" readOnly value={shareUrl} aria-label={text.linkLabel} onFocus={event => event.currentTarget.select()} /><button type="button" aria-label={text.copyLink} onClick={() => void copyLink()}>{copied ? <Check size={19} aria-hidden="true" /> : <Copy size={19} aria-hidden="true" />}<span>{copy.copyLink}</span></button></div>
      <div className="el-event-share-links"><button type="button" disabled={busy} onClick={() => void shareLink()}><span><Share2 size={23} aria-hidden="true" /></span>{text.shareLink}</button><a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer"><span><SourceIcon asset={{ src: "/icons/facebook.svg", width: 24, height: 24 }} /></span>{copy.facebook}</a><a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(event.title)}`} target="_blank" rel="noopener noreferrer"><span><img src="/figma/twitter.png" width={24} height={24} alt="" /></span>{copy.twitter}</a><a href={`mailto:?subject=${encodeURIComponent(event.title)}&body=${encodeURIComponent(shareUrl)}`}><span><Mail size={24} aria-hidden="true" /></span>{copy.email}</a></div>
      {message && <p className="el-event-share-status" role="status">{message}</p>}
    </div>
  </dialog>;
}
