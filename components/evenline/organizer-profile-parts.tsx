"use client";

import { ResponsiveImage } from "@/components/ui/responsive-image";
import { useEffect, useRef, useState } from "react";
import { Share2 } from "lucide-react";
import { copy } from "@/locales/fa";

export function OrganizerCover({ src }: { src: string | null }) {
  const [failed, setFailed] = useState<string | null>(null);
  return src && failed !== src ? <ResponsiveImage priority sizes="(max-width: 375px) 100vw, 375px" className="el-organizer-cover" src={src} alt="" onError={() => setFailed(src)} /> : null;
}

export function OrganizerBiography({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const paragraph = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const element = paragraph.current;
    if (!element || expanded) return;
    const observer = new ResizeObserver(() => setOverflowing(element.scrollHeight > element.clientHeight + 1));
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, expanded]);
  return <div className="el-organizer-biography">
    <p id="organizer-biography" ref={paragraph} className={expanded ? "" : "el-biography-clamped"}>{text || copy.noBiography}</p>
    {(overflowing || expanded) && <button type="button" className="el-text-action" aria-expanded={expanded} aria-controls="organizer-biography" onClick={() => setExpanded(value => !value)}>{expanded ? copy.showLessProfile : copy.showMoreProfile}</button>}
  </div>;
}

export function ShareOrganizer({ name }: { name: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <div className="el-organizer-share">
    <button type="button" className="el-icon-button" disabled={busy} aria-label={copy.shareOrganizer} onClick={async () => {
      setBusy(true); setMessage("");
      try {
        const url = new URL(window.location.pathname, window.location.origin).href;
        if (navigator.share) await navigator.share({ title: name, url });
        else { await navigator.clipboard.writeText(url); setMessage(copy.profileLinkCopied); }
      } catch (error) {
        if ((error as Error).name !== "AbortError") setMessage(copy.profileShareFailed);
      } finally { setBusy(false); }
    }}><Share2 size={20} aria-hidden="true" /></button>
    {message && <span className="el-organizer-share-status" role="status">{message}</span>}
  </div>;
}
