import type { Data } from "./model.js";
import type { EventRecord } from "./events/model.js";
import type { EventCard, EventMeta, EventResults } from "./events/viewer.js";

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id); if (!node) throw new Error(`Missing element ${id}`); return node as T;
}
const ui = { search: el<HTMLInputElement>("search"), clear: el<HTMLButtonElement>("clear-search"),
  category: el<HTMLSelectElement>("category-select"), categories: el("category-list"), source: el<HTMLSelectElement>("source"),
  city: el<HTMLSelectElement>("city"), period: el<HTMLSelectElement>("period"), sort: el<HTMLSelectElement>("sort"),
  free: el<HTMLInputElement>("free"), online: el<HTMLInputElement>("online"), photos: el<HTMLInputElement>("has-photos"),
  results: el("results"), pagination: el("pagination"), detail: el<HTMLDialogElement>("store-dialog"), detailContent: el("detail-content"),
  photo: el<HTMLDialogElement>("photo-dialog"), lightbox: el("lightbox-image"), original: el<HTMLAnchorElement>("photo-original") };
const numbers = new Intl.NumberFormat("fa-IR"), dates = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeZone: "Asia/Tehran" });
const dateTimes = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" });
const sourceLabels: Record<string, string> = { jabama: "جاباما ایونت", davvvat: "دعوت" };
interface Filters { q: string; category: string; source: string; city: string; period: string; sort: string; free: boolean; online: boolean; photos: boolean; page: number }
let meta: EventMeta | null = null, detail: EventRecord | null = null, photoIndex = 0;
let resultsRequest: AbortController | null = null, detailRequest: AbortController | null = null;
let debounce: ReturnType<typeof setTimeout> | undefined;
function readFilters(): Filters {
  const p = new URL(location.href).searchParams, page = Number(p.get("page") ?? 1);
  return { q: (p.get("q") ?? "").slice(0, 300), category: p.get("category") ?? "", source: p.get("source") ?? "", city: p.get("city") ?? "",
    period: ["all", "upcoming", "past"].includes(p.get("period") ?? "") ? p.get("period")! : "all",
    sort: ["date", "name", "photos"].includes(p.get("sort") ?? "") ? p.get("sort")! : "date",
    free: p.get("free") === "1", online: p.get("online") === "1", photos: p.get("photos") === "1", page: Number.isSafeInteger(page) && page > 0 ? page : 1 };
}
let filters = readFilters();
function esc(value: unknown) { return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!); }
function icon(name: string) { return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`; }
function object(value: unknown): Data { return value && typeof value === "object" && !Array.isArray(value) ? value as Data : {}; }
function http(value: unknown): string | null { try { const url = new URL(String(value)); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; } }
function link(value: unknown, label: string, className = "button") { const url = http(value); return url ? `<a class="${className}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}${icon("arrow")}</a>` : ""; }
function formatDate(value: unknown, time = false) {
  if (typeof value !== "string") return "";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  return Number.isFinite(date.getTime()) ? (time ? dateTimes : dates).format(date) : "";
}
function categoryLabel(code: string) { return meta?.categories.find(option => option.code === code)?.label ?? code; }
function schedule(event: Pick<EventCard, "start_date" | "end_date" | "start_time" | "end_time" | "date_text">) {
  const range = [formatDate(event.start_date), event.end_date && event.end_date !== event.start_date ? `تا ${formatDate(event.end_date)}` : ""].filter(Boolean).join(" ");
  const clock = [event.start_time, event.end_time].filter(Boolean).join(" تا ");
  return [range, clock].filter(Boolean).join(" · ") || event.date_text || "زمان اعلام نشده";
}
function price(value: EventRecord["price"]) {
  if (value.is_free === true) return "رایگان";
  if (value.text) return value.text;
  if (value.amount !== null) return `${numbers.format(value.amount)}${value.currency ? ` ${value.currency === "IRT" ? "تومان" : value.currency === "IRR" ? "ریال" : value.currency}` : " (واحد اعلام نشده)"}`;
  return "هزینه اعلام نشده";
}
function params() {
  const p = new URLSearchParams();
  for (const key of ["q", "category", "source", "city"] as const) if (filters[key]) p.set(key, filters[key]);
  if (filters.sort !== "date") p.set("sort", filters.sort);
  if (filters.period !== "all") p.set("period", filters.period);
  for (const key of ["free", "online", "photos"] as const) if (filters[key]) p.set(key, "1");
  if (filters.page > 1) p.set("page", String(filters.page)); return p;
}
function currentUrl(id: string | null = new URL(location.href).searchParams.get("event")) {
  const url = new URL("/events", location.origin); url.search = params().toString(); if (id) url.searchParams.set("event", id); return url;
}
function syncUrl(id?: string | null, push = false) { const url = currentUrl(id); if (url.href !== location.href) history[push ? "pushState" : "replaceState"]({}, "", url); }
async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal }); const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "دریافت داده انجام نشد."); return body;
}
function placeholder(message = "عکسی ثبت نشده") { return `<span class="photo-placeholder">${icon("photo")}<span>${esc(message)}</span></span>`; }
function imageFallbacks(container: HTMLElement) {
  for (const image of container.querySelectorAll<HTMLImageElement>("img")) {
    const parent = image.parentElement;
    const label = parent?.querySelector(".photo-placeholder span");
    const fail = () => { image.hidden = true; parent?.classList.remove("image-loading"); parent?.classList.add("image-failed"); if (label) label.textContent = "عکس بارگذاری نشد"; };
    const loaded = () => { parent?.classList.remove("image-loading"); parent?.classList.remove("image-failed"); };
    image.addEventListener("error", fail, { once: true }); image.addEventListener("load", loaded, { once: true });
    if (image.complete) { if (image.naturalWidth) loaded(); else fail(); }
    else { parent?.classList.add("image-loading"); if (label) label.textContent = "در حال دریافت عکس…"; }
  }
}
function controls() {
  // A metadata refresh must not erase text while its search debounce is pending.
  if (debounce === undefined) ui.search.value = filters.q;
  ui.clear.hidden = !ui.search.value;
  for (const key of ["category", "source", "city", "period", "sort"] as const) ui[key].value = filters[key];
  for (const key of ["free", "online", "photos"] as const) ui[key].checked = filters[key];
  el("page-title").textContent = filters.category ? categoryLabel(filters.category) : "همه رویدادها";
  for (const button of ui.categories.querySelectorAll<HTMLElement>("[data-category]")) button.setAttribute("aria-pressed", String(button.dataset.category === filters.category));
}
function renderMeta() {
  if (!meta) return;
  const options = [{ code: "", label: "همه رویدادها", count: meta.total }, ...meta.categories];
  ui.categories.innerHTML = options.map(option => `<button class="category-option" data-category="${esc(option.code)}" aria-pressed="${option.code === filters.category}"><span>${esc(option.label)}</span><span class="category-count">${numbers.format(option.count)}</span></button>`).join("");
  ui.category.innerHTML = options.map(option => `<option value="${esc(option.code)}">${esc(option.label)} (${numbers.format(option.count)})</option>`).join("");
  ui.source.innerHTML = `<option value="">همه منابع</option>${meta.sources.map(source => `<option value="${source.code}">${esc(source.label)} (${numbers.format(source.count)})</option>`).join("")}`;
  ui.city.innerHTML = `<option value="">همه شهرها</option>${meta.cities.map(city => `<option value="${esc(city.label)}">${esc(city.label)} (${numbers.format(city.count)})</option>`).join("")}`;
  el("total-label").textContent = `${numbers.format(meta.total)} رویداد از دو منبع`;
  el("capture-date").textContent = meta.captured_at ? `به‌روزرسانی ${formatDate(meta.captured_at, true)}` : "";
  const reports = object(meta.reports);
  el("source-status").innerHTML = meta.sources.map(source => {
    const report = object(reports[source.code]), complete = report.complete === true;
    const state = report.state === "running" ? "در حال گردآوری" : complete ? "گردآوری‌شده" : "پوشش بخشی از داده‌ها";
    return `<span class="source-summary ${complete ? "complete" : "partial"}"><span class="note-dot"></span>${esc(source.label)} · ${numbers.format(source.count)} رویداد · ${state}</span>`;
  }).join(""); controls();
}
function renderPagination(data: EventResults) {
  ui.pagination.hidden = !data.total || data.pages <= 1;
  const pages = [...new Set([1, data.page - 1, data.page, data.page + 1, data.pages])].filter(page => page > 0 && page <= data.pages).sort((a, b) => a - b);
  let previous = 0;
  ui.pagination.innerHTML = `<button class="page-button" data-page="${data.page - 1}" aria-label="صفحه قبلی" ${data.page === 1 ? "disabled" : ""}>${icon("right")}</button>${pages.map(page => {
    const gap = previous && page - previous > 1 ? `<span class="pagination-gap">…</span>` : ""; previous = page;
    return `${gap}<button class="page-button" data-page="${page}" ${page === data.page ? 'aria-current="page"' : ""} aria-label="صفحه ${numbers.format(page)}">${numbers.format(page)}</button>`;
  }).join("")}<button class="page-button" data-page="${data.page + 1}" aria-label="صفحه بعدی" ${data.page === data.pages ? "disabled" : ""}>${icon("left")}</button>`;
}
function renderResults(data: EventResults) {
  filters.page = data.page; syncUrl(); renderPagination(data);
  el("result-count").textContent = data.total ? `${numbers.format(data.total)} رویداد · نمایش ${numbers.format((data.page - 1) * data.limit + 1)} تا ${numbers.format(Math.min(data.page * data.limit, data.total))}` : "هیچ رویدادی پیدا نشد";
  ui.results.innerHTML = data.items.length ? data.items.map(event => {
    const cover = http(event.cover_url);
    return `<article><a class="store-card event-card" data-event="${esc(event.event_id)}" href="${esc(currentUrl(event.event_id).href)}" aria-label="مشاهده جزئیات ${esc(event.title)}">
      <div class="card-photo ${cover ? "" : "empty-image"}">${cover ? `<img src="${esc(cover)}" alt="${esc(event.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}${placeholder()}<span class="event-source-badge">${esc(sourceLabels[event.source])}</span>${event.photo_count ? `<span class="photo-badge">${icon("photo")}${numbers.format(event.photo_count)}</span>` : ""}</div>
      <div class="card-content"><span class="card-category">${event.categories.slice(0, 2).map(code => esc(categoryLabel(code))).join(" · ")}</span><h2 class="card-name" dir="auto">${esc(event.title)}</h2>
        <p class="event-date">${esc(schedule(event))}</p><p class="card-address">${icon("pin")}<span>${esc([event.online ? "برخط" : event.city, event.area ?? event.address].filter(Boolean).join("، ") || "مکان اعلام نشده")}</span></p>
        <div class="card-footer"><span class="event-price">${esc(price(event.price))}</span><span class="card-open">جزئیات ${icon("left")}</span></div></div></a></article>`;
  }).join("") : `<div class="empty-state">${icon("search")}<h2>رویدادی پیدا نشد</h2><p>عبارت دیگری را جست‌وجو کنید یا فیلترها را بردارید.</p><button class="button" data-reset>پاک کردن فیلترها</button></div>`;
  imageFallbacks(ui.results);
}
async function loadResults() {
  resultsRequest?.abort(); const request = new AbortController(); resultsRequest = request;
  ui.results.setAttribute("aria-busy", "true"); el("result-count").textContent = "در حال جست‌وجو…";
  try { const data = await get<EventResults>(`/api/events?${params()}`, request.signal); if (resultsRequest === request) renderResults(data); }
  catch (error) {
    if (request.signal.aborted || resultsRequest !== request) return;
    ui.pagination.hidden = true; el("result-count").textContent = "دریافت فهرست انجام نشد";
    ui.results.innerHTML = `<div class="empty-state"><h2>فهرست دریافت نشد</h2><p>${esc(error instanceof Error ? error.message : "دوباره تلاش کنید.")}</p><button class="button" data-retry>تلاش دوباره</button><button class="button" data-reset>پاک کردن فیلترها</button></div>`;
  } finally { if (resultsRequest === request) ui.results.setAttribute("aria-busy", "false"); }
}
function change(changes: Partial<Filters>) { clearTimeout(debounce); debounce = undefined; filters = { ...filters, ...changes, page: 1 }; controls(); syncUrl(); void loadResults(); }
function renderGallery() {
  if (!detail?.photos[photoIndex]) return;
  const photo = detail.photos[photoIndex], url = http(photo.url); if (!url) return;
  const hero = el("gallery-hero"); hero.classList.remove("image-failed");
  hero.innerHTML = `<img src="${esc(url)}" alt="${esc(detail.title)}" referrerpolicy="no-referrer">${placeholder("عکس بارگذاری نشد")}<span class="gallery-expand">${icon("photo")}نمایش بزرگ</span>`;
  el("gallery-counter").textContent = `${numbers.format(photoIndex + 1)} از ${numbers.format(detail.photos.length)} عکس`;
  for (const button of ui.detailContent.querySelectorAll<HTMLElement>("[data-photo]")) button.setAttribute("aria-pressed", String(Number(button.dataset.photo) === photoIndex));
  imageFallbacks(hero); if (ui.photo.open) renderLightbox();
}
function renderLightbox() {
  if (!detail?.photos[photoIndex]) return;
  const url = http(detail.photos[photoIndex].url); if (!url) return;
  el("lightbox-caption").textContent = `${detail.title} · ${numbers.format(photoIndex + 1)} از ${numbers.format(detail.photos.length)}`;
  ui.lightbox.classList.remove("image-failed"); ui.lightbox.innerHTML = `<img src="${esc(url)}" alt="${esc(detail.title)}" referrerpolicy="no-referrer">${placeholder("عکس بارگذاری نشد")}`;
  ui.original.href = url; imageFallbacks(ui.lightbox);
  el<HTMLButtonElement>("lightbox-prev").disabled = detail.photos.length <= 1; el<HTMLButtonElement>("lightbox-next").disabled = detail.photos.length <= 1;
}
function openPhoto() { if (!detail?.photos.length) return; renderLightbox(); if (!ui.photo.open) ui.photo.showModal(); }
function movePhoto(delta: number) { if (!detail?.photos.length) return; photoIndex = (photoIndex + delta + detail.photos.length) % detail.photos.length; renderGallery(); }
function renderReview(review: Data) {
  const reply = typeof review.organizerReply === "string" ? review.organizerReply : object(review.organizerReply).text;
  return `<article class="review"><div class="review-header"><bdi>${esc(review.userName ?? object(review.author).name ?? "کاربر")}</bdi><time>${esc(formatDate(review.createdAt ?? review.created_at))}</time></div>
    ${typeof review.rating === "number" ? `<span class="review-reaction">امتیاز ${numbers.format(review.rating)}</span>` : ""}<p class="review-body" dir="auto">${esc(review.text ?? review.body ?? "")}</p>${reply ? `<p class="detail-note">پاسخ برگزارکننده: ${esc(reply)}</p>` : ""}</article>`;
}
function renderDetail(event: EventRecord) {
  detail = { ...event, photos: event.photos.filter(photo => http(photo.url)) }; photoIndex = 0;
  const photos = detail.photos;
  const facts = [{ label: "زمان", value: schedule(event) }, { label: "هزینه", value: price(event.price) },
    { label: "شهر", value: event.city }, { label: "محل برگزاری", value: event.venue }, { label: "برگزارکننده", value: event.organizer.name },
    { label: "وضعیت منبع", value: ({ published: "منتشرشده", expired: "پایان‌یافته", inactive: "غیرفعال", sold_out: "تکمیل ظرفیت" } as Record<string, string>)[event.status ?? ""] ?? event.status },
    { label: "مدت", value: event.duration }, { label: "منبع", value: sourceLabels[event.source] }].filter(fact => fact.value);
  ui.detailContent.innerHTML = `<div class="detail-layout"><div class="detail-info"><div class="detail-identity"><div class="eyebrow">${esc(sourceLabels[event.source])}</div><h2 id="detail-name" dir="auto">${esc(event.title)}</h2><p class="detail-address">${icon("pin")}<span>${esc(event.address ?? (event.categories.some(c => c.code === "online") ? "رویداد برخط" : "آدرس اعلام نشده"))}</span></p></div>
    <div class="detail-links">${link(event.source_url, "صفحهٔ رویداد")}${link(event.map_url, "روی نقشه")}${event.booking_url !== event.source_url ? link(event.booking_url, "لینک اعلام‌شده") : ""}${link(event.organizer.url, "برگزارکننده")}</div>
    <section class="detail-section"><h3>اطلاعات رویداد</h3><dl class="detail-facts">${facts.map(fact => `<div><dt>${esc(fact.label)}</dt><dd dir="auto">${esc(fact.value)}</dd></div>`).join("")}</dl>${event.location_precision === "approximate" ? '<p class="detail-note">موقعیت نقشه تقریبی است.</p>' : ""}</section>
    <section class="detail-section"><h3>دسته‌بندی‌ها</h3><div class="tag-list">${event.categories.map(category => `<button class="tag" data-detail-category="${esc(category.code)}" title="${esc(category.method === "title-rule" ? "بر اساس عنوان رویداد" : category.method === "source-category" ? "بر اساس دستهٔ منبع" : "دستهٔ عمومی")}">${esc(category.label)}</button>`).join("")}</div><p class="detail-note">دسته‌های منبع: ${event.source_categories.map(category => esc(category.label ?? category.code)).join("، ")}</p></section>
    ${event.tags.length ? `<div class="tag-list">${event.tags.map(tag => `<span class="tag">${esc(tag)}</span>`).join("")}</div>` : ""}
    ${event.description ? `<section class="detail-section"><h3>دربارهٔ رویداد</h3><p class="event-description" dir="auto">${esc(event.description)}</p></section>` : ""}
    ${event.sessions.length ? `<section class="detail-section"><h3>سانس‌های اعلام‌شده</h3><ul class="event-sessions">${event.sessions.map(session => `<li>${esc(formatDate(session.startIso ?? session.startDate, true) || session.title || session.date || "جزئیات در داده‌های منبع")}${typeof session.remainingSeats === "number" ? ` · ${numbers.format(session.remainingSeats)} ظرفیت باقی‌مانده در زمان گردآوری` : ""}</li>`).join("")}</ul></section>` : ""}
    ${event.terms ? `<section class="detail-section"><h3>شرایط رویداد</h3><p class="event-description" dir="auto">${esc(event.terms)}</p></section>` : ""}
    ${event.reviews.length ? `<section class="detail-section"><h3>نظرهای عمومی (${numbers.format(event.reviews.length)})</h3>${event.reviews.map(renderReview).join("")}</section>` : ""}
    ${event.videos.length ? `<section class="detail-section"><h3>ویدیوها</h3>${event.videos.map((video, i) => link(video, `ویدیوی ${numbers.format(i + 1)}`)).join("")}</section>` : ""}
    <details class="raw-details"><summary>تمام داده‌های این رویداد</summary><p class="detail-note">دسته‌های اصلی، برنامه‌ها، قوانین و فیلدهای عمومی منبع در این داده‌ها حفظ شده‌اند.</p><a class="button" href="/api/events/${encodeURIComponent(event.event_id)}?download=1">دریافت JSON</a><pre dir="ltr">${esc(JSON.stringify(event, null, 2))}</pre></details>
    <p class="detail-note">گردآوری ${esc(formatDate(event.fetched_at, true))} · زمان‌ها به وقت تهران · برای آخرین وضعیت، صفحهٔ منبع را بررسی کنید.</p></div>
    <div class="gallery">${photos.length ? `<button id="gallery-hero" class="gallery-hero" aria-label="نمایش بزرگ عکس"></button><div class="gallery-thumbnails">${photos.map((photo, i) => `<button class="gallery-thumb" data-photo="${i}" aria-label="عکس ${numbers.format(i + 1)}" aria-pressed="${i === 0}"><img src="${esc(http(photo.thumbnail_url) ?? photo.url)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join("")}</div><p class="gallery-caption" id="gallery-counter"></p>` : `<div class="gallery-hero empty-image">${placeholder()}</div>`}</div></div>`;
  if (photos.length) renderGallery(); imageFallbacks(ui.detailContent);
}
async function openDetail(id: string, updateUrl = true) {
  detailRequest?.abort(); const request = new AbortController(); detailRequest = request; detail = null;
  ui.detailContent.innerHTML = `<div class="loading-state"><h2 id="detail-name">در حال دریافت جزئیات…</h2></div>`;
  if (!ui.detail.open) ui.detail.showModal(); if (updateUrl) syncUrl(id, true);
  try { const event = await get<EventRecord>(`/api/events/${encodeURIComponent(id)}`, request.signal); if (detailRequest === request && ui.detail.open) renderDetail(event); }
  catch (error) {
    if (request.signal.aborted || detailRequest !== request) return;
    ui.detailContent.innerHTML = `<div class="empty-state"><h2 id="detail-name">جزئیات دریافت نشد</h2><p>${esc(error instanceof Error ? error.message : "دوباره تلاش کنید.")}</p><button class="button" data-retry-detail="${esc(id)}">تلاش دوباره</button></div>`;
  }
}
function closeDetail() { detailRequest?.abort(); if (ui.photo.open) ui.photo.close(); syncUrl(null); ui.detail.close(); }
async function boot(openSelected = true) {
  try {
    meta = await get<EventMeta>("/api/events/meta");
    if (filters.category && !meta.categories.some(category => category.code === filters.category)) filters.category = "";
    if (filters.city && !meta.cities.some(city => city.label === filters.city)) filters.city = "";
    if (filters.source && !["jabama", "davvvat"].includes(filters.source)) filters.source = "";
    renderMeta(); await loadResults(); const selected = new URL(location.href).searchParams.get("event"); if (selected && openSelected) await openDetail(selected, false);
  } catch {
    ui.results.setAttribute("aria-busy", "false");
    ui.results.innerHTML = `<div class="empty-state"><h2>فهرست در دسترس نیست</h2><p>اتصال به نمایشگر برقرار نشد.</p><button class="button" data-boot>تلاش دوباره</button></div>`;
  }
}
ui.search.addEventListener("input", () => { ui.clear.hidden = !ui.search.value; clearTimeout(debounce); debounce = setTimeout(() => change({ q: ui.search.value }), 180); });
el<HTMLFormElement>("search-form").addEventListener("submit", event => { event.preventDefault(); change({ q: ui.search.value }); });
ui.clear.addEventListener("click", () => { change({ q: "" }); ui.search.focus(); });
for (const key of ["category", "source", "city", "period", "sort"] as const) ui[key].addEventListener("change", () => change({ [key]: ui[key].value, q: ui.search.value }));
for (const key of ["free", "online", "photos"] as const) ui[key].addEventListener("change", () => change({ [key]: ui[key].checked, q: ui.search.value }));
el("refresh-data").addEventListener("click", () => void boot(false));
ui.categories.addEventListener("click", event => { const button = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-category]") : null; if (button) change({ category: button.dataset.category ?? "", q: ui.search.value }); });
ui.results.addEventListener("click", event => {
  if (!(event.target instanceof Element)) return;
  const anchor = event.target.closest<HTMLAnchorElement>("[data-event]");
  if (anchor && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); void openDetail(anchor.dataset.event!); }
  if (event.target.closest("[data-reset]")) change({ q: "", category: "", source: "", city: "", period: "all", sort: "date", free: false, online: false, photos: false });
  if (event.target.closest("[data-retry]")) void loadResults(); if (event.target.closest("[data-boot]")) void boot();
});
ui.pagination.addEventListener("click", event => {
  const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-page]") : null;
  if (!button || button.disabled) return; filters.page = Number(button.dataset.page); syncUrl(); void loadResults(); window.scrollTo({ top: 0, behavior: "instant" });
});
el("close-detail").addEventListener("click", closeDetail); el("close-photo").addEventListener("click", () => ui.photo.close());
ui.detail.addEventListener("cancel", event => { event.preventDefault(); closeDetail(); });
ui.detail.addEventListener("close", () => { if (!ui.detail.open) { detailRequest?.abort(); if (ui.photo.open) ui.photo.close(); syncUrl(null); } });
ui.detail.addEventListener("click", event => {
  if (event.target !== ui.detail) return;
  const rect = ui.detail.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDetail();
});
ui.detailContent.addEventListener("click", event => {
  if (!(event.target instanceof Element)) return;
  const photo = event.target.closest<HTMLElement>("[data-photo]"); if (photo) { photoIndex = Number(photo.dataset.photo); renderGallery(); }
  if (event.target.closest("#gallery-hero")) openPhoto();
  const retry = event.target.closest<HTMLElement>("[data-retry-detail]"); if (retry) void openDetail(retry.dataset.retryDetail!, false);
  const category = event.target.closest<HTMLElement>("[data-detail-category]"); if (category) { closeDetail(); change({ category: category.dataset.detailCategory! }); }
});
el("lightbox-prev").addEventListener("click", () => movePhoto(-1)); el("lightbox-next").addEventListener("click", () => movePhoto(1));
document.addEventListener("keydown", event => {
  if (ui.photo.open && ["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); movePhoto(event.key === "ArrowLeft" ? 1 : -1); }
  if (event.key === "/" && !ui.detail.open && !ui.photo.open && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) { event.preventDefault(); ui.search.focus(); }
});
window.addEventListener("popstate", () => { clearTimeout(debounce); debounce = undefined; filters = readFilters(); controls(); void loadResults(); const id = new URL(location.href).searchParams.get("event"); if (id) void openDetail(id, false); else if (ui.detail.open) closeDetail(); });
setInterval(() => { if (!document.hidden && !ui.detail.open && !ui.search.matches(":focus")) void boot(false); }, 60000);
controls(); void boot();
