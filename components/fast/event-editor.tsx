"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, ArrowDown, Trash2, Save, ImagePlus } from "lucide-react";
import Image from "next/image";
import { AppLink, useAppNavigate } from "@/components/event/app-navigation";
import { EventScheduleFields } from "@/components/event/event-schedule-fields";
import { initialManualSchedule, manualScheduleFields, manualDraftEnd } from "@/lib/manual-event-schedule";
import { EventDateTimeField } from "@/components/event/event-date-time-field";
import { validateImages } from "@/lib/validate-images";
import dynamic from "next/dynamic";
import { DeferredLoading } from "@/components/ui/deferred-loading";
const AdvancedProgram = dynamic(() => import("./advanced-program"), { loading: DeferredLoading });
import { useResource } from "@/hooks/use-resource";
import { api, ClientError } from "@/lib/client";
import { categories, digits } from "@/lib/types";
import { IMAGE_FILE_ACCEPT, MAX_GALLERY_IMAGES } from "@/lib/media-policy";
import { persianInput } from "@/lib/persian-date";
import type { FastEvent, FastOrganizer } from "@/lib/fast-types";
import { fastCopy as t } from "@/locales/fast-fa";
import { faContent as f } from "@/locales/domain-fa";
import styles from "./fast.module.css";
import { OrganizerField } from "./organizer-field";
import { normalizeInstagramProfile } from "@/lib/instagram-profile";
import { normalizeEventTeaser } from "@/lib/event-teaser";
import { eventTeaserCopy as teaser } from "@/locales/event-teaser-fa";
import { LOCATION_URL_ERROR, parseLocationUrl } from "@/lib/location-url";
import { EventTeaserField } from "@/components/event/event-teaser-field";
import { EventCoordinatesField } from "@/components/event/event-coordinates-field";
import { EVENT_COORDINATE_INPUT_ERROR, formatEventCoordinates, parseEventCoordinates, splitEventCoordinates } from "@/lib/event-coordinates";

type Draft = { title: string; description: string; teaser: string; category: string; host_id: string | null; organizer_id: string | null; organizer_name: string; instagram_handle: string; instagram_url: string; venue: string; address: string; city: string; maps_url: string; coordinates: string; registrationDate: string; registrationTime: string; capacity: string };
type ImageDraft = { id: string; url: string; file?: File };
const time = (value: number | null) => value === null ? "" : new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);

function initialDraft(event?: FastEvent): Draft {
  return {
    title: event?.title ?? "", description: event?.description ?? "", category: event?.category ?? "coffee", host_id: event?.host_id ?? null, organizer_id: event?.organizer_id ?? event?.host_id ?? null, organizer_name: event?.organizer_name ?? "", instagram_handle: event?.organizer_instagram ?? "",
    venue: event?.venue ?? "", address: event?.address ?? "", city: event?.city ?? "", maps_url: event?.maps_url ?? "", instagram_url: event?.instagram_url ?? "",
    coordinates: formatEventCoordinates(event?.lat, event?.lng),
    teaser: event?.teaser ?? "",
    registrationDate: event?.registration_ends_at == null ? "" : persianInput(event.registration_ends_at),
    registrationTime: event?.registration_ends_at == null ? "" : time(event.registration_ends_at),
    capacity: event?.capacity == null ? "" : String(event.capacity),
  };
}

function AdvancedSettings({ event, disabled }: { event: FastEvent; disabled: boolean }) {
  const [opened, setOpened] = useState(false);
  return <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <details className={`${styles.card} ${styles.advanced}`} onToggle={e => { if (e.currentTarget.open) setOpened(true); }}>
      <summary>{t.advanced}</summary>{opened && <AdvancedProgram event={event} />}
    </details>
  </fieldset>;
}

export function FastEventEditor({ initial, organizers }: { initial?: FastEvent; organizers: FastOrganizer[] }) {
  const navigate = useAppNavigate();
  const directory = useResource<{ organizers: FastOrganizer[] }>("/api/fast/organizers", { organizers });
  const availableOrganizers = directory.data?.organizers ?? organizers;
  const [event, setEvent] = useState(initial);
  const [draft, setDraft] = useState(() => initialDraft(initial));
  const [scheduleDraft, setScheduleDraft] = useState(() => initialManualSchedule(initial));
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
    setErrorStatus(undefined);
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
  function showError(error: unknown) { setError(error instanceof Error ? error.message : t.unexpectedError); setErrorStatus(error instanceof ClientError ? error.status : undefined); }
  async function save() {
    if (submitting.current) return;
    if (normalizeInstagramProfile(draft.instagram_url) === undefined) { setError(t.instagramInvalid); setErrorStatus(undefined); return; }
    if (normalizeEventTeaser(draft.teaser) === undefined) { setError(teaser.invalid); setErrorStatus(undefined); return; }
    const locationUnchanged = event && draft.maps_url === (event.maps_url ?? "") &&
      draft.coordinates === formatEventCoordinates(event.lat, event.lng);
    const { coordinates, ...fields } = draft, point = splitEventCoordinates(coordinates);
    if (!locationUnchanged && parseEventCoordinates(point.lat, point.lng) === undefined) { setError(EVENT_COORDINATE_INPUT_ERROR); setErrorStatus(undefined); return; }
    submitting.current = true; setBusy(true); setError(""); setErrorStatus(undefined); setSaved(false);
    const body = new FormData();
    let uploadIndex = 0;
    const galleryItems = gallery.map(image => image.file ? { uploadIndex: uploadIndex++ } : { mediaId: image.id });
    body.set("data", JSON.stringify({ ...fields, ...manualScheduleFields(scheduleDraft), lat: locationUnchanged ? undefined : point.lat, lng: locationUnchanged ? undefined : point.lng,
      organizer_name: draft.host_id ? null : draft.organizer_name, maps_url: event && draft.maps_url === (event.maps_url ?? "") ? event.maps_url : draft.maps_url, capacity: digits(draft.capacity), revision: event?.revision,
      published: !!event?.published, coverAction: cover?.file ? "replace" : cover ? "keep" : "remove", galleryItems }));
    if (cover?.file) body.set("cover", cover.file);
    for (const image of gallery) if (image.file) body.append("gallery", image.file);
    try {
      const result = await api<{ event: FastEvent }>(event ? `/api/fast/events/${event.id}` : "/api/fast/events", body, event ? "PUT" : "POST");
      setDirty(false);
      if (!event) { navigate(`/fast/events/${result.event.id}`); return; }
      for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear();
      setEvent(result.event); setDraft(initialDraft(result.event)); setScheduleDraft(initialManualSchedule(result.event));
      directory.reload();
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
  const scheduleEnd = manualDraftEnd(scheduleDraft);
  return <>
    <div className={styles.heading}><div><AppLink href="/fast" onNavigate={event => { if (dirty && !window.confirm(t.leaveConfirm)) event.preventDefault(); }}><ArrowRight size={15} /> {t.back}</AppLink><h1>{event ? t.editEvent : t.newEvent}</h1>{event && <span className={`${styles.badge} ${event.published ? styles.published : ""}`}>{event.published ? t.published : t.draft}</span>}</div>
      {event && <div className={styles.actions}>{!!event.published && <AppLink className="button outline" href={`/events/${event.id}`} target="_blank" rel="noopener noreferrer">{t.view}</AppLink>}<button className="button outline" disabled={busy || dirty} onClick={() => void publish()}>{event.published ? t.unpublish : t.publish}</button><button className={`button outline ${styles.danger}`} disabled={busy || dirty || !event.canDelete} title={!event.canDelete ? t.deleteBlocked : undefined} onClick={() => void remove()}>{t.delete}</button></div>}
    </div>
    {locked && <p className={styles.notice}>{t.bookedLocked}</p>}
    {!event && <p className={styles.notice}>{t.draftHint}</p>}
    {!availableOrganizers.length && <p className={styles.notice}>{t.noOrganizers}</p>}
    <form onSubmit={e => { e.preventDefault(); void save(); }} aria-busy={busy}>
      <section className={styles.card}><h2>{t.basic}</h2><div className={styles.grid}>
        {field("title", f.eventTitle, { required: true, maxLength: 120, wide: true })}
        <div className={`${styles.field} ${styles.wide}`}><label htmlFor="event-description">{f.aboutEvent}</label><textarea id="event-description" required maxLength={4000} rows={8} disabled={busy} value={draft.description} onChange={e => change("description", e.target.value)} aria-describedby="event-description-help" /><small id="event-description-help" className={styles.muted}>بین پاراگراف‌ها یک خط خالی بگذارید. خط‌های جدید و فاصلهٔ پاراگراف‌ها در صفحهٔ رویداد حفظ می‌شوند.</small></div>
        <EventTeaserField className={`${styles.field} ${styles.wide}`} value={draft.teaser} onChange={value => change("teaser", value)} disabled={busy} />
        <label className={styles.field}>{f.category}<select value={draft.category} disabled={busy} onChange={e => change("category", e.target.value)}>{categories.filter(item => item.id !== "all").map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <OrganizerField organizers={availableOrganizers} hostId={draft.host_id} organizerId={draft.organizer_id} name={draft.organizer_name} instagramHandle={draft.instagram_handle} disabled={busy} identityLocked={!!locked} onInstagramChange={value => change("instagram_handle", value)} onChange={value => { setDraft(current => ({ ...current, ...value, organizer_name: value.organizer_name ?? "" })); setDirty(true); setSaved(false); }} />
        <label className={`${styles.field} ${styles.wide}`}>{t.instagram}<input type="text" dir="ltr" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={2048} placeholder="@hamghadam" aria-describedby="event-instagram-hint" disabled={busy} value={draft.instagram_url} onChange={e => change("instagram_url", e.target.value)} /><small id="event-instagram-hint" className={styles.muted}>{t.eventInstagramHint}</small></label>
        {field("venue", f.venueName, { required: true, maxLength: 120, disabled: locked })}
        {field("city", f.city, { required: true, maxLength: 80, disabled: locked })}
        {field("address", f.addressOptional, { maxLength: 300, wide: true, disabled: locked })}
        <label className={`${styles.field} ${styles.wide}`}>{f.venueLink}<input required={!event || !!event.maps_url} maxLength={2048} type="url" dir="ltr" value={draft.maps_url} disabled={busy || locked} aria-describedby="event-location-hint" onChange={e => {
          const value = e.target.value, location = parseLocationUrl(value);
          e.target.setCustomValidity(value.trim() && !location ? LOCATION_URL_ERROR : "");
          setDraft(current => ({ ...current, maps_url: value, coordinates: formatEventCoordinates(location?.lat, location?.lng) }));
          setDirty(true); setSaved(false);
        }} /><small id="event-location-hint" className={styles.muted}>پیوند نقشه یا وب‌سایت محل را اینجا وارد کنید. لینک پست و ریلز اینستاگرام را در بخش تیزر وارد کنید.</small>{draft.maps_url && !parseLocationUrl(draft.maps_url) && <small role="status">{LOCATION_URL_ERROR}</small>}</label>
        <EventCoordinatesField value={draft.coordinates} onChange={value => change("coordinates", value)} disabled={busy || locked} fieldClassName={`${styles.field} ${styles.wide}`} hintClassName={`${styles.muted} ${styles.wide}`} />
      </div></section>
      <section className={styles.card}><h2>{f.dateTime}</h2>
        <EventScheduleFields value={scheduleDraft} disabled={busy || !!locked} onChange={value => { setScheduleDraft(value); setDirty(true); setSaved(false); }} />
        <label className={styles.deadlineToggle}><input type="checkbox" checked={!!(draft.registrationDate || draft.registrationTime)} disabled={busy || (scheduleEnd === null && !draft.registrationDate && !draft.registrationTime)} aria-describedby="fast-registration-help" onChange={e => {
          setDraft(current => ({ ...current, registrationDate: e.target.checked && scheduleEnd !== null ? persianInput(scheduleEnd) : "", registrationTime: e.target.checked ? time(scheduleEnd) : "" }));
          setDirty(true); setSaved(false);
        }} /> {f.registrationDeadlineOptional}</label>
        <p id="fast-registration-help" className={styles.muted}>{scheduleDraft.mode === "weekly" && !scheduleDraft.until ? "برای تعیین مهلت ثبت‌نام، ابتدا تاریخ پایان تکرار را مشخص کنید." : f.registrationDefaultHint}</p>
        {(draft.registrationDate || draft.registrationTime) && <fieldset className={styles.dateGroup} disabled={busy}><legend>{f.registrationDeadline}</legend><div className={`${styles.calendar} ${styles.field}`}><EventDateTimeField label={f.registrationDeadline} dateValue={draft.registrationDate} time={draft.registrationTime} onDateChange={value => change("registrationDate", value)} onTimeChange={value => change("registrationTime", value)} disabled={busy} /></div></fieldset>}
      </section>
      <section className={styles.card}><h2>ظرفیت رویداد</h2><div className={styles.grid}>
        {field("capacity", f.optionalCapacity, { inputMode: "numeric", placeholder: t.unlimited })}
      </div></section>
      <section className={styles.card}><h2><ImagePlus size={18} /> {t.images}</h2><p className={styles.muted}>{f.imageRequirements}</p>
        <label className={styles.field}>{t.cover}<input key={`cover-${uploadKey}`} type="file" accept={IMAGE_FILE_ACCEPT} disabled={busy} onChange={e => { chooseImages(Array.from(e.target.files ?? []), "cover"); e.target.value = ""; }} /></label>
        {cover && <div className={styles.gallery}><figure className={styles.image}><Image src={cover.url} alt={t.cover} width={400} height={300} unoptimized /><figcaption><button type="button" disabled={busy} aria-label={t.remove} onClick={() => { release(cover); setCover(null); setDirty(true); setSaved(false); }}><Trash2 size={16} /></button></figcaption></figure></div>}
        <label className={styles.field}>{t.gallery}<input key={`gallery-${uploadKey}`} type="file" multiple accept={IMAGE_FILE_ACCEPT} disabled={busy || gallery.length >= MAX_GALLERY_IMAGES} onChange={e => { chooseImages(Array.from(e.target.files ?? []), "gallery"); e.target.value = ""; }} /></label>
        <div className={styles.gallery}>{gallery.map((image, index) => <figure className={styles.image} key={image.id}><Image src={image.url} alt={`${t.imageAlt} ${index + 1}`} width={400} height={300} unoptimized /><figcaption><button type="button" disabled={busy || index === 0} aria-label={t.moveUp} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button type="button" disabled={busy || index === gallery.length - 1} aria-label={t.moveDown} onClick={() => move(index, 1)}><ArrowDown size={16} /></button><button type="button" disabled={busy} aria-label={t.remove} onClick={() => { release(image); setGallery(items => items.filter(item => item.id !== image.id)); setDirty(true); setSaved(false); }}><Trash2 size={16} /></button></figcaption></figure>)}</div>
      </section>
      {error && <div className={styles.error} role="alert">{error}{!!errorStatus && <div dir="ltr">HTTP {errorStatus}</div>}{errorStatus === 401 && <> <a href="/fast/login" target="_blank" rel="noopener noreferrer">{t.signIn}</a></>}{errorStatus === 409 && <button type="button" className="button outline" onClick={() => { if (!dirty || window.confirm(t.leaveConfirm)) window.location.reload(); }}>{t.refresh}</button>}</div>}
      {saved && <p role="status" className={styles.success}>{t.saved}</p>}
      <div className={styles.saveBar}><span className={styles.muted}>{event && !event.canDelete ? t.deleteBlocked : t.draftHint}</span><button className="button" disabled={busy}><Save size={17} />{busy ? t.saving : t.saveDraft}</button></div>
    </form>
    <div style={{ marginTop: 24 }}>{event ? <AdvancedSettings key={event.revision} event={event} disabled={busy || dirty} /> : <p className={styles.notice}>{t.advancedHint}</p>}</div>
  </>;
}
