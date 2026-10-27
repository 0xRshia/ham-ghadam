"use client";
import { useEffect, useRef, useState } from "react";
import { AppLink } from "@/components/event/app-navigation";
import { validateImages } from "@/components/event/event-form";
import { ProgramForm } from "@/components/evenline/program-editor";
import { api } from "@/lib/client";
import { categories } from "@/lib/types";
import { IMAGE_MIME_TYPES, MAX_GALLERY_IMAGES } from "@/lib/media-policy";
import { scheduleDateLabel, scheduleTimeLabel } from "@/lib/event-schedule";
import type { FastEvent } from "@/lib/fast-types";
import { normalizeEventTeaser } from "@/lib/event-teaser";
import { eventTeaserCopy } from "@/locales/event-teaser-fa";
import styles from "./fast.module.css";
import { EventTeaserField } from "@/components/event/event-teaser-field";
import { OrganizerAvatarField } from "./organizer-avatar-field";

type GalleryImage = { id: string; url: string; file?: File };
export function SheetEventEditor({ initial }: { initial: FastEvent }) {
  const [event,setEvent] = useState(initial);
  const [category,setCategory] = useState(initial.category);
  const [teaser,setTeaser] = useState(initial.teaser ?? "");
  const [gallery,setGallery] = useState<GalleryImage[]>(initial.gallery);
  const [busy,setBusy] = useState(false), [error,setError] = useState(""), [saved,setSaved] = useState(false);
  const previews = useRef(new Set<string>());
  const dirty = teaser !== (event.teaser ?? "") || category !== event.category || gallery.length !== event.gallery.length || gallery.some((image,index) => !!image.file || image.id !== event.gallery[index]?.id);
  useEffect(() => { const urls = previews.current; return () => { for (const url of urls) URL.revokeObjectURL(url); }; }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (unload: BeforeUnloadEvent) => { unload.preventDefault(); unload.returnValue = ""; };
    window.addEventListener("beforeunload",warn);
    return () => window.removeEventListener("beforeunload",warn);
  }, [dirty]);
  function removeImage(image: GalleryImage) {
    if (image.file) { URL.revokeObjectURL(image.url); previews.current.delete(image.url); }
    setGallery(items => items.filter(item => item.id !== image.id)); setSaved(false);
  }
  async function save() {
    if (normalizeEventTeaser(teaser) === undefined) { setError(eventTeaserCopy.invalid); return; }
    setBusy(true); setError(""); setSaved(false);
    try {
      const form = new FormData();
      let uploadIndex = 0;
      form.set("data", JSON.stringify({ revision: event.revision, category, teaser, galleryItems: gallery.map(item => item.file ? { uploadIndex: uploadIndex++ } : { mediaId: item.id }) }));
      for (const item of gallery) if (item.file) form.append("gallery",item.file);
      const result = await api<{ event: FastEvent }>(`/api/fast/events/${event.id}`,form,"PUT");
      for (const url of previews.current) URL.revokeObjectURL(url);
      previews.current.clear();
      setEvent(result.event); setTeaser(result.event.teaser ?? ""); setGallery(result.event.gallery); setSaved(true);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <div className={styles.heading}><div><h1>{event.title}</h1><p>رویداد متصل به شیت · {event.published ? "منتشرشده" : "منتشرنشده"}</p></div><AppLink className="button outline" href="/fast">بازگشت به فهرست</AppLink></div>
    <p className={styles.notice}>اطلاعات اصلی، زمان‌بندی و پوستر را در Google Sheets تغییر دهید. دسته‌بندی، گالری، تیزر و ویدیو در این پنل مدیریت و در همگام‌سازی حفظ می‌شوند.</p>
    <section className={styles.card}><h2>اطلاعات منبع</h2><p>{event.organizer_name} · {event.city}</p><p>{event.venue}</p><p style={{whiteSpace:"pre-line"}}>{event.address}</p><p>{scheduleDateLabel(event)}</p><p style={{whiteSpace:"pre-line"}}>{scheduleTimeLabel(event)}</p><p style={{whiteSpace:"pre-wrap"}}>{event.description}</p>{event.image && <div className={styles.gallery}><figure className={styles.image}><img src={event.image} alt={event.title}/></figure></div>}</section>
    {(event.organizer_id || event.host_id) && <section className={styles.card}><OrganizerAvatarField organizerId={event.organizer_id ?? event.host_id} disabled={busy} /></section>}
    <form className={styles.card} onSubmit={e => { e.preventDefault(); void save(); }} onChange={() => setSaved(false)}>
      <label className={styles.field}>دسته‌بندی<select disabled={busy} value={category} onChange={e => setCategory(e.target.value)}>{categories.filter(item => item.id !== "all").map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <EventTeaserField className={styles.field} value={teaser} onChange={setTeaser} disabled={busy} />
      <div className={styles.gallery}>{gallery.map((item,index) => <figure key={item.id} className={styles.image}><img src={item.url} alt={`تصویر گالری ${index+1}`}/><figcaption>
        <button type="button" disabled={busy || !index} aria-label="انتقال به ابتدای گالری" onClick={() => { const next=[...gallery]; next.splice(index,1); next.unshift(item); setGallery(next); setSaved(false); }}>↑</button>
        <button type="button" disabled={busy} onClick={() => removeImage(item)}>حذف</button>
      </figcaption></figure>)}</div>
      <label className={styles.field}>افزودن تصویر گالری<input key={event.revision} type="file" multiple accept={IMAGE_MIME_TYPES.join(",")} disabled={busy || gallery.length >= MAX_GALLERY_IMAGES} onChange={e => {
        const files = [...(e.target.files ?? [])];
        const problem = validateImages([...gallery.flatMap(item => item.file ? [item.file] : []),...files]);
        if (problem || gallery.length+files.length>MAX_GALLERY_IMAGES) {setError(problem || "حداکثر شش تصویر گالری مجاز است.");return;}
        setError("");setSaved(false);setGallery(items => [...items,...files.map(file => {const url=URL.createObjectURL(file);previews.current.add(url);return {id:crypto.randomUUID(),url,file};})]);
      }}/></label>
      {error && <p className={styles.error} role="alert">{error}</p>}{saved && <p className={styles.success} role="status">تغییرات ذخیره شد.</p>}<button className="button" disabled={busy}>{busy ? "در حال ذخیره…" : "ذخیره تغییرات"}</button>
    </form>
    {event.program && <section className={`${styles.card} ${styles.advanced}`}><ProgramForm key={event.id} event={event} initial={event.program} initialSeries={[]} allowSeries={false} endpoint={`/api/fast/events/${event.id}/program`}/></section>}
  </>;
}
