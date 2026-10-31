import type { Data } from "./model.js";
import type { GalleryImage, StoreDetail, ViewerMeta, ViewerResults } from "./viewer-data.js";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element: ${id}`);
  return found as T;
}
const ui = {
  search: element<HTMLInputElement>("search"), clear: element<HTMLButtonElement>("clear-search"),
  form: element<HTMLFormElement>("search-form"), sort: element<HTMLSelectElement>("sort"),
  category: element<HTMLSelectElement>("category-select"), categories: element("category-list"),
  photos: element<HTMLInputElement>("has-photos"), results: element("results"), count: element("result-count"),
  title: element("page-title"), total: element("total-label"), captureDate: element("capture-date"),
  pagination: element("pagination"), detail: element<HTMLDialogElement>("store-dialog"), detailContent: element("detail-content"),
  photo: element<HTMLDialogElement>("photo-dialog"), lightboxImage: element("lightbox-image"),
  lightboxCaption: element("lightbox-caption"), original: element<HTMLAnchorElement>("photo-original"),
};
const numbers = new Intl.NumberFormat("fa-IR");
const dates = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeZone: "Asia/Tehran" });
const foodLabels: Record<string, string> = { pizza: "پیتزا", burger: "برگر", coffee: "قهوه", dessert: "کیک و دسر",
  breakfast: "صبحانه", fried_chicken: "مرغ سوخاری", kebab: "کباب", pasta: "پاستا", sandwich: "ساندویچ", steak: "استیک", traditional_iranian_food: "غذای ایرانی" };
const primaryCategories = ["cafe", "restaurant", "bakery", "meal_takeaway", "bar", "grocery_or_supermarket", "clothing_store", "hair_care", "health", "meal_delivery", "store", "food"];
let meta: ViewerMeta | null = null;
let detail: StoreDetail | null = null;
let photoIndex = 0;
let resultsRequest: AbortController | null = null;
let detailRequest: AbortController | null = null;
let debounce: ReturnType<typeof setTimeout> | undefined;

interface Filters { q: string; category: string; photos: boolean; sort: string; page: number }
function readFilters(): Filters {
  const params = new URL(location.href).searchParams;
  const page = Number(params.get("page") ?? 1);
  const sort = params.get("sort") ?? "photos";
  return { q: (params.get("q") ?? "").slice(0, 300), category: params.get("category") ?? "", photos: params.get("photos") === "1",
    sort: ["name", "photos", "reviews"].includes(sort) ? sort : "photos", page: Number.isSafeInteger(page) && page > 0 ? page : 1 };
}
let filters = readFilters();

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
function icon(name: string): string { return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`; }
function object(value: unknown): Data { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Data : {}; }
function http(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
function date(value: unknown): string {
  const parsed = new Date(String(value ?? ""));
  return Number.isFinite(parsed.getTime()) ? dates.format(parsed) : "";
}
function categoryLabel(code: string): string { return meta?.categories.find(category => category.code === code)?.label ?? code.replaceAll("_", " "); }
function primaryCategory(categories: string[]): string {
  const selected = filters.category && categories.includes(filters.category) ? filters.category : primaryCategories.find(code => categories.includes(code)) ?? categories[0];
  return selected ? categoryLabel(selected) : "مکان";
}
function placeholder(message = "عکسی ثبت نشده"): string { return `<span class="photo-placeholder">${icon("photo")}<span>${escapeHtml(message)}</span></span>`; }
function imageFallbacks(container: HTMLElement) {
  for (const image of container.querySelectorAll<HTMLImageElement>("img")) {
    const fail = () => { image.hidden = true; image.parentElement?.classList.add("image-failed"); };
    image.addEventListener("error", fail, { once: true });
    if (image.complete && !image.naturalWidth) fail();
  }
}
async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "دریافت اطلاعات انجام نشد.");
  return data as T;
}

function currentUrl(storeId: string | null = new URL(location.href).searchParams.get("store")): URL {
  const url = new URL(location.href);
  url.search = "";
  if (filters.q) url.searchParams.set("q", filters.q);
  if (filters.category) url.searchParams.set("category", filters.category);
  if (filters.photos) url.searchParams.set("photos", "1");
  if (filters.sort !== "photos") url.searchParams.set("sort", filters.sort);
  if (filters.page > 1) url.searchParams.set("page", String(filters.page));
  if (storeId) url.searchParams.set("store", storeId);
  return url;
}
function syncUrl(storeId?: string | null, push = false) {
  const url = currentUrl(storeId);
  if (url.href !== location.href) history[push ? "pushState" : "replaceState"]({}, "", url);
}
function applyControls() {
  ui.search.value = filters.q; ui.clear.hidden = !filters.q;
  ui.sort.value = filters.sort; ui.category.value = filters.category; ui.photos.checked = filters.photos;
  ui.title.textContent = filters.category ? categoryLabel(filters.category) : "همه مکان‌ها";
  for (const button of ui.categories.querySelectorAll<HTMLButtonElement>("[data-category]")) {
    button.setAttribute("aria-pressed", String(button.dataset.category === filters.category));
  }
}
function renderCategories() {
  if (!meta) return;
  const options = [{ code: "", label: "همه مکان‌ها", count: meta.total }, ...meta.categories];
  ui.categories.innerHTML = options.map(option => `<button class="category-option" data-category="${escapeHtml(option.code)}" aria-pressed="${option.code === filters.category}"><span>${escapeHtml(option.label)}</span><span class="category-count">${numbers.format(option.count)}</span></button>`).join("");
  ui.category.innerHTML = options.map(option => `<option value="${escapeHtml(option.code)}">${escapeHtml(option.label)} (${numbers.format(option.count)})</option>`).join("");
  ui.total.textContent = `${numbers.format(meta.total)} مکان در فهرست`;
  ui.captureDate.textContent = meta.captured_at ? `گردآوری‌شده در ${date(meta.captured_at)}` : "فهرست مکان‌های اینوارا";
  applyControls();
}

function renderResults(data: ViewerResults) {
  filters.page = data.page;
  syncUrl();
  const first = data.total ? (data.page - 1) * data.limit + 1 : 0;
  const last = Math.min(data.page * data.limit, data.total);
  ui.count.textContent = data.total ? `${numbers.format(data.total)} مکان · نمایش ${numbers.format(first)} تا ${numbers.format(last)}` : "هیچ مکانی پیدا نشد";
  if (!data.items.length) {
    ui.results.innerHTML = `<div class="empty-state">${icon("search")}<h2>مکانی پیدا نشد</h2><p>نام دیگری را امتحان کنید یا فیلترها را بردارید.</p><button class="button" data-reset>پاک کردن فیلترها</button></div>`;
  } else ui.results.innerHTML = data.items.map(store => {
    const photo = http(store.cover_url);
    return `<article><a class="store-card" data-store="${escapeHtml(store.place_id)}" href="${escapeHtml(currentUrl(store.place_id).href)}" aria-label="مشاهده جزئیات ${escapeHtml(store.name)}">
      <div class="card-photo ${photo ? "" : "empty-image"}">${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(store.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}${placeholder()}
      ${store.photo_count ? `<span class="photo-badge">${icon("photo")}${numbers.format(store.photo_count)}</span>` : ""}</div>
      <div class="card-content"><span class="card-category">${escapeHtml(primaryCategory(store.categories))}</span><h2 class="card-name" title="${escapeHtml(store.name)}"><bdi>${escapeHtml(store.name)}</bdi></h2>
      <p class="card-address">${icon("pin")}<span dir="auto">${escapeHtml(store.address ?? "آدرسی ثبت نشده")}</span></p>
      <div class="card-footer"><span>${icon("review")}${store.review_count ? `${numbers.format(store.review_count)} نظر` : "بدون نظر"}</span><span class="card-open">دیدن جزئیات ${icon("left")}</span></div></div></a></article>`;
  }).join("");
  imageFallbacks(ui.results);
  ui.pagination.hidden = data.pages <= 1 || !data.total;
  const pages = [...new Set([1, data.page - 1, data.page, data.page + 1, data.pages])].filter(page => page > 0 && page <= data.pages).sort((a, b) => a - b);
  let previous = 0;
  const pageButtons = pages.map(page => {
    const gap = previous && page - previous > 1 ? `<span class="pagination-gap" aria-hidden="true">…</span>` : "";
    previous = page;
    return `${gap}<button class="page-button" data-page="${page}" aria-label="صفحه ${numbers.format(page)}"${page === data.page ? ' aria-current="page"' : ""}>${numbers.format(page)}</button>`;
  }).join("");
  ui.pagination.innerHTML = `<button class="page-button" data-page="${data.page - 1}" aria-label="صفحه قبلی" ${data.page === 1 ? "disabled" : ""}>${icon("right")}</button>${pageButtons}<button class="page-button" data-page="${data.page + 1}" aria-label="صفحه بعدی" ${data.page === data.pages ? "disabled" : ""}>${icon("left")}</button>`;
}

async function loadResults() {
  resultsRequest?.abort();
  const request = new AbortController(); resultsRequest = request;
  ui.results.setAttribute("aria-busy", "true"); ui.count.textContent = "در حال جست‌وجو…";
  const params = new URLSearchParams({ q: filters.q, category: filters.category, photos: filters.photos ? "1" : "0", sort: filters.sort, page: String(filters.page) });
  try {
    const data = await getJSON<ViewerResults>(`/api/stores?${params}`, request.signal);
    if (resultsRequest === request) renderResults(data);
  } catch (error) {
    if (request.signal.aborted || resultsRequest !== request) return;
    ui.count.textContent = "دریافت فهرست انجام نشد";
    ui.pagination.hidden = true;
    ui.results.innerHTML = `<div class="empty-state">${icon("store")}<h2>فهرست دریافت نشد</h2><p>${escapeHtml(error instanceof Error ? error.message : "دوباره تلاش کنید.")}</p><button class="button" data-retry>تلاش دوباره</button><button class="button" data-reset>پاک کردن فیلترها</button></div>`;
  } finally { if (resultsRequest === request) ui.results.setAttribute("aria-busy", "false"); }
}
function changeFilters(changes: Partial<Filters>) {
  clearTimeout(debounce);
  filters = { ...filters, ...changes, page: 1 };
  applyControls(); syncUrl(); void loadResults();
}

function externalLink(url: unknown, label: string, className = "button"): string {
  const safe = http(url);
  return safe ? `<a class="${className}" href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}${icon("arrow")}</a>` : "";
}
function reviewImages(review: Data): string {
  const images = Array.isArray(review.images) ? review.images : [];
  return images.map(image => {
    const raw = object(image);
    const url = http(typeof image === "string" ? image : raw.url ?? raw.original_url ?? raw.image_url ?? raw.thumbnail_url);
    if (!url) return "";
    const index = detail?.gallery.findIndex(photo => photo.url === url || photo.thumbnail_url === url) ?? -1;
    return index >= 0 ? `<button class="review-photo" data-photo="${index}" aria-label="نمایش عکس این نظر"><img src="${escapeHtml(url)}" alt="عکس همراه نظر" loading="lazy" referrerpolicy="no-referrer"></button>` : externalLink(url, "عکس نظر", "review-source");
  }).join("");
}
function renderReview(review: Data): string {
  const author = object(review.author);
  const name = [author.first_name, author.last_name].filter(value => typeof value === "string" && value).join(" ") || author.username || "کاربر اینوارا";
  const reaction = review.reaction === "liked" ? "پسندیده" : review.reaction === "disliked" ? "نپسندیده" : "";
  const foods = Array.isArray(review.dish_tags) ? review.dish_tags.filter(value => typeof value === "string") as string[] : [];
  return `<article class="review"><div class="review-header"><bdi>${escapeHtml(name)}</bdi><time datetime="${escapeHtml(review.created_at)}">${date(review.created_at)}</time></div>
    ${reaction ? `<span class="review-reaction ${review.reaction === "disliked" ? "disliked" : ""}">${reaction}</span>` : ""}
    ${typeof review.body === "string" && review.body ? `<p class="review-body" dir="auto">${escapeHtml(review.body)}</p>` : ""}
    ${foods.length ? `<div class="tag-list">${foods.map(code => `<span class="tag">${escapeHtml(foodLabels[code] ?? code)}</span>`).join("")}</div>` : ""}
    <div class="review-images">${reviewImages(review)}</div>${externalLink(review.instagram_post_url, "پست مرتبط", "review-source")}</article>`;
}

function renderGalleryImage() {
  if (!detail?.gallery.length) return;
  const photo = detail.gallery[photoIndex];
  const hero = element<HTMLButtonElement>("gallery-hero");
  hero.classList.remove("image-failed");
  hero.innerHTML = `<img src="${escapeHtml(photo.url)}" alt="${escapeHtml(detail.store.name)}، عکس ${numbers.format(photoIndex + 1)}" referrerpolicy="no-referrer">${placeholder("عکس بارگذاری نشد")}<span class="gallery-expand">${icon("photo")}نمایش بزرگ</span>`;
  element("gallery-counter").textContent = `${numbers.format(photoIndex + 1)} از ${numbers.format(detail.gallery.length)} عکس`;
  element("gallery-kind").textContent = photo.kind === "review" ? "عکس همراه نظر" : "عکس مکان";
  for (const button of ui.detailContent.querySelectorAll<HTMLElement>(".gallery-thumb")) button.setAttribute("aria-pressed", String(Number(button.dataset.photo) === photoIndex));
  imageFallbacks(hero);
  if (ui.photo.open) renderLightbox();
}
function renderLightbox() {
  if (!detail?.gallery.length) return;
  const photo = detail.gallery[photoIndex];
  ui.lightboxCaption.textContent = `${detail.store.name} · ${numbers.format(photoIndex + 1)} از ${numbers.format(detail.gallery.length)}`;
  ui.lightboxImage.classList.remove("image-failed");
  ui.lightboxImage.innerHTML = `<img src="${escapeHtml(photo.url)}" alt="${escapeHtml(detail.store.name)}، عکس ${numbers.format(photoIndex + 1)}" referrerpolicy="no-referrer">${placeholder("عکس بارگذاری نشد")}`;
  ui.original.href = photo.url;
  element<HTMLButtonElement>("lightbox-prev").disabled = detail.gallery.length <= 1;
  element<HTMLButtonElement>("lightbox-next").disabled = detail.gallery.length <= 1;
  imageFallbacks(ui.lightboxImage);
}
function openPhoto(index: number) {
  if (!detail?.gallery[index]) return;
  photoIndex = index; renderGalleryImage(); renderLightbox();
  if (!ui.photo.open) ui.photo.showModal();
}
function movePhoto(delta: number) {
  if (!detail?.gallery.length) return;
  photoIndex = (photoIndex + delta + detail.gallery.length) % detail.gallery.length;
  renderGalleryImage();
}

function renderDetail(value: StoreDetail) {
  detail = value; photoIndex = 0;
  const { store, gallery } = value;
  const metro = object(store.nearest_metro);
  const lines = Array.isArray(metro.lines) ? metro.lines.filter(line => typeof line === "number" || typeof line === "string").map(line => numbers.format(Number(line))).join("، ") : "";
  const coordinates = typeof store.latitude === "number" && typeof store.longitude === "number";
  const mapUrl = coordinates ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.latitude},${store.longitude}`)}` : null;
  const facts = [
    ...(metro.name ? [{ name: "نزدیک‌ترین مترو", value: `${metro.name}${lines ? ` · خط ${lines}` : ""}` }] : []),
    ...(store.price_level !== null ? [{ name: "سطح قیمت", value: numbers.format(store.price_level) }] : []),
    { name: "عکس‌ها", value: `${numbers.format(gallery.length)} عکس` },
    { name: "نظرها", value: `${numbers.format(store.reviews.length)} نظر` },
  ];
  ui.detailContent.innerHTML = `<div class="detail-layout"><div class="detail-info">
    <div class="detail-identity"><div class="eyebrow">${escapeHtml(primaryCategory(store.categories))}</div><h2 id="detail-name"><bdi>${escapeHtml(store.name)}</bdi></h2><p class="detail-address">${icon("pin")}<span dir="auto">${escapeHtml(store.address ?? "آدرسی ثبت نشده")}</span></p></div>
    <div class="detail-links">${externalLink(store.source_url, "صفحهٔ اینوارا")}${externalLink(mapUrl, "روی نقشه")}${externalLink(store.menu_url, "منوی مکان")}</div>
    <section class="detail-section"><h3>اطلاعات مکان</h3><dl class="detail-facts">${facts.map(fact => `<div><dt>${escapeHtml(fact.name)}</dt><dd>${escapeHtml(fact.value)}</dd></div>`).join("")}${coordinates ? `<div><dt>مختصات</dt><dd class="detail-coordinates" dir="ltr">${store.latitude!.toFixed(6)}, ${store.longitude!.toFixed(6)}</dd></div>` : ""}</dl></section>
    ${store.tags.length ? `<section class="detail-section"><h3>ویژگی‌ها</h3><div class="tag-list">${store.tags.map(tag => `<span class="tag attribute">${escapeHtml(tag.label_fa ?? tag.code)}</span>`).join("")}</div></section>` : ""}
    <section class="detail-section"><h3>دسته‌بندی‌ها</h3><div class="tag-list">${store.categories.map(code => `<button class="tag" data-detail-category="${escapeHtml(code)}" title="${escapeHtml(code)}">${escapeHtml(categoryLabel(code))}</button>`).join("")}</div></section>
    <section class="detail-section"><h3>نظرها <span class="category-count">(${numbers.format(store.reviews.length)})</span></h3>${store.reviews.length ? `<div class="review-list">${store.reviews.map(renderReview).join("")}</div>` : `<p class="no-reviews">نظری برای نمایش نیست.</p>`}</section>
    <details class="raw-details"><summary>تمام داده‌های این مکان</summary><a class="button" href="/api/stores/${encodeURIComponent(store.place_id)}?download=1">${icon("download")}دریافت جزئیات JSON</a><pre>${escapeHtml(JSON.stringify(store, null, 2))}</pre></details>
    <p class="detail-note">گردآوری‌شده در ${date(store.fetched_at)}</p></div>
    <div class="gallery ${gallery.length ? "" : "empty"}">${gallery.length ? `<button class="gallery-hero" id="gallery-hero" aria-label="نمایش بزرگ عکس"></button><div class="gallery-thumbnails" aria-label="عکس‌های مکان">${gallery.map((photo: GalleryImage, index: number) => `<button class="gallery-thumb" data-photo="${index}" aria-pressed="${index === 0}" aria-label="نمایش عکس ${numbers.format(index + 1)}"><img src="${escapeHtml(photo.thumbnail_url)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join("")}</div><div class="gallery-caption"><span id="gallery-counter"></span><span id="gallery-kind"></span></div>` : placeholder("عکسی برای این مکان ثبت نشده")}</div></div>`;
  imageFallbacks(ui.detailContent);
  if (gallery.length) renderGalleryImage();
  ui.detail.scrollTop = 0;
}

async function openDetail(id: string, updateUrl = true) {
  detailRequest?.abort();
  const request = new AbortController(); detailRequest = request;
  detail = null;
  ui.detailContent.innerHTML = `<div class="loading-state"><span class="loading-dot"></span><h2 id="detail-name">در حال دریافت جزئیات…</h2></div>`;
  if (!ui.detail.open) ui.detail.showModal();
  if (updateUrl) syncUrl(id, true);
  try {
    const value = await getJSON<StoreDetail>(`/api/stores/${encodeURIComponent(id)}`, request.signal);
    if (detailRequest === request && ui.detail.open) renderDetail(value);
  } catch (error) {
    if (request.signal.aborted || detailRequest !== request) return;
    ui.detailContent.innerHTML = `<div class="empty-state detail-fetch-error"><h2 id="detail-name">جزئیات دریافت نشد</h2><p>${escapeHtml(error instanceof Error ? error.message : "دوباره تلاش کنید.")}</p><button class="button" data-retry-detail="${escapeHtml(id)}">تلاش دوباره</button></div>`;
  }
}

function closeDetail() {
  detailRequest?.abort();
  if (ui.photo.open) ui.photo.close();
  syncUrl(null);
  ui.detail.close();
}

async function boot() {
  try {
    meta = await getJSON<ViewerMeta>("/api/meta");
    if (filters.category && !meta.categories.some(category => category.code === filters.category)) filters.category = "";
    renderCategories();
    await loadResults();
    const selected = new URL(location.href).searchParams.get("store");
    if (selected) await openDetail(selected, false);
  } catch {
    ui.results.setAttribute("aria-busy", "false"); ui.count.textContent = "فهرست در دسترس نیست";
    ui.results.innerHTML = `<div class="empty-state">${icon("store")}<h2>فهرست در دسترس نیست</h2><p>اتصال به نمایشگر برقرار نشد. دوباره تلاش کنید.</p><button class="button" data-boot>تلاش دوباره</button></div>`;
  }
}

ui.search.addEventListener("input", () => {
  ui.clear.hidden = !ui.search.value;
  clearTimeout(debounce);
  debounce = setTimeout(() => changeFilters({ q: ui.search.value }), 180);
});
ui.form.addEventListener("submit", event => { event.preventDefault(); changeFilters({ q: ui.search.value }); });
ui.clear.addEventListener("click", () => { changeFilters({ q: "" }); ui.search.focus(); });
ui.sort.addEventListener("change", () => changeFilters({ sort: ui.sort.value, q: ui.search.value }));
ui.photos.addEventListener("change", () => changeFilters({ photos: ui.photos.checked, q: ui.search.value }));
ui.category.addEventListener("change", () => changeFilters({ category: ui.category.value, q: ui.search.value }));
ui.categories.addEventListener("click", event => {
  const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-category]") : null;
  if (button) changeFilters({ category: button.dataset.category ?? "", q: ui.search.value });
});
ui.results.addEventListener("click", event => {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>("[data-store]");
  if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); void openDetail(link.dataset.store!); }
  if (event.target.closest("[data-reset]")) changeFilters({ q: "", category: "", photos: false, sort: "photos" });
  if (event.target.closest("[data-retry]")) void loadResults();
  if (event.target.closest("[data-boot]")) void boot();
});
ui.pagination.addEventListener("click", event => {
  const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-page]") : null;
  if (!button || button.disabled) return;
  filters.page = Number(button.dataset.page); syncUrl(); void loadResults();
  window.scrollTo({ top: 0, behavior: "instant" });
});
element("close-detail").addEventListener("click", closeDetail);
element("close-photo").addEventListener("click", () => ui.photo.close());
ui.detail.addEventListener("cancel", event => { event.preventDefault(); closeDetail(); });
ui.detail.addEventListener("close", () => {
  if (!ui.detail.open) { detailRequest?.abort(); if (ui.photo.open) ui.photo.close(); syncUrl(null); }
});
ui.detail.addEventListener("click", event => {
  if (event.target === ui.detail) {
    const rect = ui.detail.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDetail();
  }
});
ui.detailContent.addEventListener("click", event => {
  if (!(event.target instanceof Element)) return;
  const photo = event.target.closest<HTMLButtonElement>("[data-photo]");
  if (photo) {
    if (photo.classList.contains("review-photo")) openPhoto(Number(photo.dataset.photo));
    else { photoIndex = Number(photo.dataset.photo); renderGalleryImage(); }
  }
  if (event.target.closest("#gallery-hero")) openPhoto(photoIndex);
  const retry = event.target.closest<HTMLButtonElement>("[data-retry-detail]");
  if (retry) void openDetail(retry.dataset.retryDetail!, false);
  const category = event.target.closest<HTMLButtonElement>("[data-detail-category]");
  if (category) { closeDetail(); changeFilters({ category: category.dataset.detailCategory! }); }
});
element("lightbox-prev").addEventListener("click", () => movePhoto(-1));
element("lightbox-next").addEventListener("click", () => movePhoto(1));
document.addEventListener("keydown", event => {
  if (ui.photo.open && ["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); movePhoto(event.key === "ArrowLeft" ? 1 : -1); }
  if (event.key === "/" && !ui.detail.open && !ui.photo.open && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) { event.preventDefault(); ui.search.focus(); }
});
window.addEventListener("popstate", () => {
  filters = readFilters(); applyControls(); void loadResults();
  const selected = new URL(location.href).searchParams.get("store");
  if (selected) void openDetail(selected, false);
  else if (ui.detail.open) closeDetail();
});
applyControls();
void boot();
