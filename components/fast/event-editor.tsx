"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, ArrowDown, Trash2, Save, ImagePlus } from "lucide-react";
import Image from "next/image";
import { AppLink, useAppNavigate } from "@/components/event/app-navigation";
import { EventDateTimeField, validateImages } from "@/components/event/event-form";
import { TierForm } from "@/components/evenline/tier-editor";
import { ProgramForm } from "@/components/evenline/program-editor";
import { useResource } from "@/hooks/use-resource";
import { api, ClientError } from "@/lib/client";
import { categories, digits } from "@/lib/types";
import { IMAGE_MIME_TYPES, MAX_GALLERY_IMAGES } from "@/lib/media-policy";
import { persianInput } from "@/lib/persian-date";
import type { FastEvent, FastOrganizer } from "@/lib/fast-types";
import { fastCopy as t } from "@/locales/fast-fa";
import { faContent as f } from "@/locales/domain-fa";
import styles from "./fast.module.css";
import { OrganizerField } from "./organizer-field";

type Draft = { title: string; description: string; category: string; host_id: string | null; organizer_name: string; venue: string; address: string; city: string; maps_url: string; date: string; time: string; endDate: string; endTime: string; registrationDate: string; registrationTime: string; price: string; capacity: string };
type ImageDraft = { id: string; url: string; file?: File };
const time = (value: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);

function initialDraft(event?: FastEvent): Draft {
  const tomorrow = Date.now() + 86400000;
  return {
    title: event?.title ?? "", description: event?.description ?? "", category: event?.category ?? "coffee", host_id: event?.host_id ?? null, organizer_name: event?.organizer_name ?? "",
    venue: event?.venue ?? "", address: event?.address ?? "", city: event?.city ?? "", maps_url: event?.maps_url ?? "",
    date: persianInput(event?.starts_at ?? tomorrow), time: event ? time(event.starts_at) : "18:00",
    endDate: persianInput(event?.ends_at ?? tomorrow), endTime: event ? time(event.ends_at) : "20:00",
    registrationDate: persianInput(event?.registration_ends_at ?? tomorrow), registrationTime: event ? time(event.registration_ends_at) : "18:00",
    price: String(event?.price ?? 0), capacity: event?.capacity == null ? "" : String(event.capacity),
  };
}

function AdvancedSettings({ event, disabled }: { event: FastEvent; disabled: boolean }) {
  const series = useResource<{ series: { id: string; title: string }[] }>(event.host_id ? `/api/fast/event-series?host_id=${encodeURIComponent(event.host_id)}` : null);
  return <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <details className={`${styles.card} ${styles.advanced}`}><summary>{f.ticketsCapacity}</summary>
      <TierForm id={event.id} initial={event.ticketTiers ?? []} endpoint={`/api/fast/events/${event.id}/tiers`} />
    </details>
    <details className={`${styles.card} ${styles.advanced}`}><summary>{t.advanced}</summary>
      {!event.host_id && <p className={styles.muted}>{t.organizerSeriesUnavailable}</p>}
      {series.loading ? <p role="status">{t.loading}</p> : series.error ? <div className={styles.error} role="alert">{series.error}<button className="button outline" onClick={series.reload}>{t.retry}</button></div> : event.program && (!event.host_id || series.data) &&
        <ProgramForm event={event} initial={event.program} initialSeries={series.data?.series ?? []} endpoint={`/api/fast/events/${event.id}/program`} seriesEndpoint="/api/fast/event-series" seriesHostId={event.host_id ?? undefined} allowSeries={!!event.host_id} />}
    </details>
  </fieldset>;
}

export function FastEventEditor({ initial, organizers }: { initial?: FastEvent; organizers: FastOrganizer[] }) {
  const navigate = useAppNavigate();
  const [event, setEvent] = useState(initial);
  const [draft, setDraft] = useState(() => initialDraft(initial));
  const [cover, setCover] = useState<ImageDraft | null>(() => initial?.image ? { id: "existing-cover", url: initial.image } : null);
  const [gallery, setGallery] = useState<ImageDraft[]>(() => initial?.gallery ?? []);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState<number>();
  const [uploadKey, setUploadKey] = useState(0);
  const urls = useRef(new Set<string>());
  const submitting = useRef(false);

  useEffect(() => {
    const previews = urls.current;
    return () => { for (const url of previews) URL.revokeObjectURL(url); previews.clear(); };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);

  function change(key: keyof Draft, value: string) { setDraft(current => ({ ...current, [key]: value })); setDirty(true); setSaved(false); }
  function preview(file: File) {
    const url = URL.createObjectURL(file); urls.current.add(url);
    return { id: crypto.randomUUID(), file, url };
  }
  function release(image: ImageDraft | null) {
    if (image?.file) { URL.revokeObjectURL(image.url); urls.current.delete(image.url); }
  }
  function chooseImages(files: File[], role: "cover" | "gallery") {
    if (!files.length) return;
    if (role === "gallery" && gallery.length + files.length > MAX_GALLERY_IMAGES) { setError(f.galleryImageLimit); return; }
    const selected = [...(role === "cover" ? files : cover?.file ? [cover.file] : []), ...gallery.flatMap(image => image.file ? [image.file] : []), ...(role === "gallery" ? files : [])];
    const problem = validateImages(selected);
    if (problem) { setError(problem); return; }
    setError(""); setDirty(true); setSaved(false);
    if (role === "cover") { release(cover); setCover(preview(files[0])); }
    else setGallery(current => [...current, ...files.map(preview)]);
  }
  function move(index: number, delta: number) {
    const next = [...gallery]; [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setGallery(next); setDirty(true); setSaved(false);
  }
  function showError(error: unknown) { setError((error as Error).message); setErrorStatus(error instanceof ClientError ? error.status : undefined); }
  async function save() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError(""); setErrorStatus(undefined); setSaved(false);
    const body = new FormData();
    let uploadIndex = 0;
    const galleryItems = gallery.map(image => image.file ? { uploadIndex: uploadIndex++ } : { mediaId: image.id });
    body.set("data", JSON.stringify({ ...draft, organizer_name: draft.host_id ? null : draft.organizer_name, maps_url: event && draft.maps_url === (event.maps_url ?? "") ? event.maps_url : draft.maps_url, price: digits(draft.price), capacity: digits(draft.capacity), revision: event?.revision,
      published: !!event?.published, coverAction: cover?.file ? "replace" : cover ? "keep" : "remove", galleryItems }));
    if (cover?.file) body.set("cover", cover.file);
    for (const image of gallery) if (image.file) body.append("gallery", image.file);
    try {
      const result = await api<{ event: FastEvent }>(event ? `/api/fast/events/${event.id}` : "/api/fast/events", body, event ? "PUT" : "POST");
      setDirty(false);
      if (!event) { navigate(`/fast/events/${result.event.id}`); return; }
      for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear();
      setEvent(result.event); setDraft(initialDraft(result.event));
      setCover(result.event.image ? { id: "existing-cover", url: result.event.image } : null);
      setGallery(result.event.gallery); setUploadKey(value => value + 1); setSaved(true);
    } catch (error) { showError(error); }
    finally { submitting.current = false; setBusy(false); }
  }
  async function publish() {
    if (!event || busy) return;
    setBusy(true); setError(""); setSaved(false);
    try { const result = await api<{ event: FastEvent }>(`/api/fast/events/${event.id}`, { revision: event.revision, published: !event.published }, "PATCH"); setEvent(result.event); setSaved(true); }
    catch (error) { showError(error); } finally { setBusy(false); }
  }
  async function remove() {
    if (!event || busy || !window.confirm(t.deleteConfirm)) return;
    setBusy(true); setError("");
    try { await api(`/api/fast/events/${event.id}`, { revision: event.revision }, "DELETE"); navigate("/fast"); }
    catch (error) { showError(error); setBusy(false); }
  }
  function field(key: keyof Draft, label: string, options: { wide?: boolean; required?: boolean; maxLength?: number; disabled?: boolean; dir?: "ltr"; inputMode?: "numeric"; type?: string; placeholder?: string } = {}) {
    const { wide, ...inputProps } = options;
    return <label className={`${styles.field} ${wide ? styles.wide : ""}`}>{label}<input {...inputProps} value={draft[key] ?? ""} disabled={busy || options.disabled} onChange={e => change(key, e.target.value)} /></label>;
  }
  const locked = event?.hasReservations;
  return <>
    <div className={styles.heading}><div><AppLink href="/fast" onNavigate={event => { if (dirty && !window.confirm(t.leaveConfirm)) event.preventDefault(); }}><ArrowRight size={15} /> {t.back}</AppLink><h1>{event ? t.editEvent : t.newEvent}</h1>{event && <span className={`${styles.badge} ${event.published ? styles.published : ""}`}>{event.published ? t.published : t.draft}</span>}</div>
      {event && <div className={styles.actions}>{!!event.published && <AppLink className="button outline" href={`/events/${event.id}`} target="_blank" rel="noopener noreferrer">{t.view}</AppLink>}<button className="button outline" disabled={busy || dirty} onClick={() => void publish()}>{event.published ? t.unpublish : t.publish}</button><button className={`button outline ${styles.danger}`} disabled={busy || dirty || !event.canDelete} title={!event.canDelete ? t.deleteBlocked : undefined} onClick={() => void remove()}>{t.delete}</button></div>}
    </div>
    {locked && <p className={styles.notice}>{t.bookedLocked}</p>}
    {!event && <p className={styles.notice}>{t.draftHint}</p>}
    {!organizers.length && <p className={styles.notice}>{t.noOrganizers}</p>}
    <form onSubmit={e => { e.preventDefault(); void save(); }} aria-busy={busy}>
      <section className={styles.card}><h2>{t.basic}</h2><div className={styles.grid}>
        {field("title", f.eventTitle, { required: true, maxLength: 120, wide: true })}
        <label className={`${styles.field} ${styles.wide}`}>{f.aboutEvent}<textarea required maxLength={4000} rows={6} disabled={busy} value={draft.description} onChange={e => change("description", e.target.value)} /></label>
        <label className={styles.field}>{f.category}<select value={draft.category} disabled={busy} onChange={e => change("category", e.target.value)}>{categories.filter(item => item.id !== "all").map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <OrganizerField organizers={organizers} hostId={draft.host_id} name={draft.organizer_name} disabled={busy || !!locked} onChange={value => { setDraft(current => ({ ...current, ...value, organizer_name: value.organizer_name ?? "" })); setDirty(true); setSaved(false); }} />
        {field("venue", f.venueName, { required: true, maxLength: 120, disabled: locked })}
        {field("city", f.city, { required: true, maxLength: 80, disabled: locked })}
        {field("address", f.addressOptional, { maxLength: 300, wide: true, disabled: locked })}
        {field("maps_url", f.venueLink, { required: !event || !!event.maps_url, maxLength: 2048, type: "url", dir: "ltr", wide: true, disabled: locked })}
      </div></section>
      <section className={styles.card}><h2>{f.dateTime}</h2><p className={styles.muted}>{t.scheduleHint}</p><div className={styles.dates}>
        {([
          ["date", "time", t.startDate], ["endDate", "endTime", t.endDate], ["registrationDate", "registrationTime", f.registrationDeadline],
        ] as const).map(([dateKey, timeKey, label]) => <fieldset className={styles.dateGroup} key={dateKey} disabled={busy || (dateKey !== "registrationDate" && locked)}><legend>{label}</legend><div className={`${styles.calendar} ${styles.field}`}><EventDateTimeField label={label} dateValue={draft[dateKey]} time={draft[timeKey]} onDateChange={value => change(dateKey, value)} onTimeChange={value => change(timeKey, value)} disabled={busy || (dateKey !== "registrationDate" && !!locked)} /></div></fieldset>)}
      </div></section>
      <section className={styles.card}><h2>{f.ticketsCapacity}</h2><div className={styles.grid}>
        {field("price", f.personPriceToman, { required: true, inputMode: "numeric" })}
        {field("capacity", f.optionalCapacity, { inputMode: "numeric", placeholder: t.unlimited })}
      </div><p className={styles.muted}>{f.pricingHint}</p></section>
      <section className={styles.card}><h2><ImagePlus size={18} /> {t.images}</h2><p className={styles.muted}>{f.imageRequirements}</p>
        <label className={styles.field}>{t.cover}<input key={`cover-${uploadKey}`} type="file" accept={IMAGE_MIME_TYPES.join(",")} disabled={busy} onChange={e => { chooseImages(Array.from(e.target.files ?? []), "cover"); e.target.value = ""; }} /></label>
        {cover && <div className={styles.gallery}><figure className={styles.image}><Image src={cover.url} alt={t.cover} width={400} height={300} unoptimized /><figcaption><button type="button" disabled={busy} aria-label={t.remove} onClick={() => { release(cover); setCover(null); setDirty(true); setSaved(false); }}><Trash2 size={16} /></button></figcaption></figure></div>}
        <label className={styles.field}>{t.gallery}<input key={`gallery-${uploadKey}`} type="file" multiple accept={IMAGE_MIME_TYPES.join(",")} disabled={busy || gallery.length >= MAX_GALLERY_IMAGES} onChange={e => { chooseImages(Array.from(e.target.files ?? []), "gallery"); e.target.value = ""; }} /></label>
        <div className={styles.gallery}>{gallery.map((image, index) => <figure className={styles.image} key={image.id}><Image src={image.url} alt={`${t.imageAlt} ${index + 1}`} width={400} height={300} unoptimized /><figcaption><button type="button" disabled={busy || index === 0} aria-label={t.moveUp} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button type="button" disabled={busy || index === gallery.length - 1} aria-label={t.moveDown} onClick={() => move(index, 1)}><ArrowDown size={16} /></button><button type="button" disabled={busy} aria-label={t.remove} onClick={() => { release(image); setGallery(items => items.filter(item => item.id !== image.id)); setDirty(true); setSaved(false); }}><Trash2 size={16} /></button></figcaption></figure>)}</div>
      </section>
      {error && <div className={styles.error} role="alert">{error}{errorStatus === 401 && <> <a href="/fast/login" target="_blank" rel="noopener noreferrer">{t.signIn}</a></>}{errorStatus === 409 && <button type="button" className="button outline" onClick={() => { if (!dirty || window.confirm(t.leaveConfirm)) window.location.reload(); }}>{t.refresh}</button>}</div>}
      {saved && <p role="status" className={styles.success}>{t.saved}</p>}
      <div className={styles.saveBar}><span className={styles.muted}>{event && !event.canDelete ? t.deleteBlocked : t.draftHint}</span><button className="button" disabled={busy}><Save size={17} />{busy ? t.saving : t.saveDraft}</button></div>
    </form>
    <div style={{ marginTop: 24 }}>{event ? <AdvancedSettings key={event.revision} event={event} disabled={busy || dirty} /> : <p className={styles.notice}>{t.advancedHint}</p>}</div>
  </>;
}
