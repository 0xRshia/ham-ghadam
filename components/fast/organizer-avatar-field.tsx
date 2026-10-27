"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Download, ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import { MAX_IMAGE_BYTES } from "@/lib/media-policy";
import { organizerAvatarCopy as t } from "@/locales/organizer-avatar-fa";
import styles from "./organizer-avatar-field.module.css";

type AvatarStatus = { url: string | null; source: "upload" | "instagram" | null; instagramConfigured: boolean; instagramHandle: string | null };
export function OrganizerAvatarField({ organizerId, disabled = false }: { organizerId: string | null; disabled?: boolean }) {
  if (!organizerId) return <fieldset className={styles.field}><legend>{t.title}</legend><small className={styles.hint}>{t.missingOrganizer}</small></fieldset>;
  return <SavedOrganizerAvatar key={organizerId} organizerId={organizerId} disabled={disabled} />;
}

function SavedOrganizerAvatar({ organizerId, disabled }: { organizerId: string; disabled: boolean }) {
  const id = useId();
  const [status, setStatus] = useState<AvatarStatus | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const attempted = useRef(new Set<string>());
  const mounted = useRef(false);
  const endpoint = `/api/fast/organizers/${encodeURIComponent(organizerId)}/avatar`;
  useEffect(() => {
    let active = true;
    mounted.current = true;
    void (async () => {
      try {
        let current = await api<AvatarStatus>(endpoint);
        if (!active) return;
        setStatus(current);
        const key = `${organizerId}:${current.instagramHandle}`;
        if (!current.url && current.instagramConfigured && current.instagramHandle && !attempted.current.has(key)) {
          // An authenticated editor may try once per selected organizer/handle.
          // Public pages never cause Graph API requests or overwrite an upload.
          attempted.current.add(key); setBusy(true);
          current = await api<AvatarStatus>(endpoint, undefined, "POST");
          if (active) setStatus(current);
        }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : t.requestFailed); }
      finally { if (active) setBusy(false); }
    })();
    return () => { active = false; mounted.current = false; };
  }, [endpoint, organizerId]);

  async function save(data: FormData | undefined, method: "PUT" | "POST" | "DELETE") {
    if (!endpoint || busy || disabled) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const current = await api<AvatarStatus>(endpoint, data, method);
      if (!mounted.current) return;
      setStatus(current); setMessage(method === "DELETE" ? t.removed : t.uploaded);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : t.requestFailed);
    } finally { if (mounted.current) setBusy(false); }
  }

  return <fieldset className={styles.field} disabled={disabled || busy} aria-describedby={`${id}-hint`}>
    <legend>{t.title}</legend>
    <>
      <div className={styles.controls}>
        {status?.url && status.url !== failedImage ? <img className={styles.preview} src={status.url} alt="" onError={() => setFailedImage(status.url)} /> : <span className={styles.placeholder} aria-hidden="true"><ImagePlus size={24} /></span>}
        <div className={styles.actions}>
          <label htmlFor={id}>{t.upload}</label>
          <input id={id} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            if (file.size > MAX_IMAGE_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError(t.invalidUpload); return; }
            const form = new FormData(); form.set("data", "{}"); form.set("cover", file);
            void save(form, "PUT");
          }} />
          <div className={styles.buttons}>
            {status?.instagramConfigured && status.instagramHandle && status.source !== "upload" && <Button type="button" size="sm" variant="outline" disabled={disabled || busy} onClick={() => void save(undefined, "POST")}><Download size={16} aria-hidden="true" />{t.instagram}</Button>}
            {status?.url && <Button type="button" size="sm" variant="ghost" disabled={disabled || busy} onClick={() => void save(undefined, "DELETE")}><Trash2 size={16} aria-hidden="true" />{t.remove}</Button>}
          </div>
        </div>
      </div>
      <small id={`${id}-hint`} className={styles.hint}>{t.hint}</small>
      {status && !status.instagramConfigured && <small className={styles.hint}>{t.unavailableHint}</small>}
      {busy && <p role="status">{t.loading}</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </>
  </fieldset>;
}
