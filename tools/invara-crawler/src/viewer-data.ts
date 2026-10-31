import type { Photo, Store } from "./model.js";

const categoryLabels: Record<string, string> = {
  cafe: "کافه", restaurant: "رستوران", meal_takeaway: "غذای بیرون‌بر", bakery: "نانوایی و شیرینی‌فروشی",
  bar: "بار", meal_delivery: "ارسال غذا", grocery_or_supermarket: "خواربارفروشی", store: "فروشگاه",
  food: "خوراکی و غذا", health: "سلامت", hair_care: "آرایشگاه", clothing_store: "پوشاک",
  point_of_interest: "نقطهٔ مورد توجه", establishment: "مکان ثبت‌شده",
};
const categoryOrder = Object.keys(categoryLabels);
const collator = new Intl.Collator("fa", { numeric: true, sensitivity: "base" });

export interface GalleryImage { url: string; thumbnail_url: string; kind: Photo["kind"]; review_id: string | null }
export interface StoreCard {
  place_id: string; name: string; address: string | null; categories: string[];
  cover_url: string | null; photo_count: number; review_count: number;
}
export interface CategoryOption { code: string; label: string; count: number }
export interface ViewerMeta {
  total: number; categories: CategoryOption[]; captured_at: string | null; has_archive: boolean;
}
export interface ViewerResults {
  items: StoreCard[]; total: number; page: number; pages: number; limit: number;
}
export interface StoreDetail { store: Store; gallery: GalleryImage[] }

export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}

export function galleryImages(photos: Photo[]): GalleryImage[] {
  const images = new Map<string, GalleryImage>();
  for (const photo of photos) {
    const url = safeHttpUrl(photo.url);
    if (!url) continue;
    const parsed = new URL(url);
    const thumbnail = /_thumb(?=\.[^.]+$)/i.test(parsed.pathname) || /thumb/i.test(photo.role);
    const key = `${parsed.origin}${parsed.pathname.replace(/_thumb(?=\.[^.]+$)/i, "")}${parsed.search}`;
    const previous = images.get(key);
    if (!previous) images.set(key, { url, thumbnail_url: url, kind: photo.kind, review_id: photo.review_id });
    else if (thumbnail) previous.thumbnail_url = url;
    else { previous.url = url; previous.kind = photo.kind; previous.review_id = photo.review_id; }
  }
  return [...images.values()];
}

export function normalizeSearch(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[يى]/g, "ی").replace(/ك/g, "ک")
    .replace(/[أإآٱ]/g, "ا").replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, "")
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[\u200c\u200d\s]+/g, " ").trim();
}

export function categoryLabel(code: string): string { return categoryLabels[code] ?? code.replaceAll("_", " "); }

export function buildCatalogue(stores: Store[]) {
  const counts = new Map<string, number>();
  const byId = new Map(stores.map(store => [store.place_id, store]));
  const entries = stores.map(store => {
    for (const category of new Set(store.categories)) counts.set(category, (counts.get(category) ?? 0) + 1);
    const gallery = galleryImages(store.photos);
    const card: StoreCard = { place_id: store.place_id, name: store.name, address: store.address,
      categories: store.categories, cover_url: safeHttpUrl(store.cover_image_url) ?? gallery[0]?.thumbnail_url ?? null,
      photo_count: gallery.length, review_count: store.reviews.length };
    const search = normalizeSearch([store.name, store.address, store.place_id, ...store.categories,
      ...store.categories.map(categoryLabel), ...store.tags.flatMap(tag => [tag.label_fa, tag.code])].filter(Boolean).join(" "));
    return { card, search };
  });
  const categories = [...counts].map(([code, count]) => ({ code, label: categoryLabel(code), count }))
    .sort((a, b) => (categoryOrder.indexOf(a.code) < 0 ? 100 : categoryOrder.indexOf(a.code))
      - (categoryOrder.indexOf(b.code) < 0 ? 100 : categoryOrder.indexOf(b.code)) || collator.compare(a.label, b.label));
  return { entries, categories, byId };
}

export function searchCatalogue(catalogue: ReturnType<typeof buildCatalogue>, params: URLSearchParams): ViewerResults {
  const query = (params.get("q") ?? "").slice(0, 300);
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);
  const compactTokens = tokens.map(token => token.replaceAll(" ", ""));
  const category = params.get("category") ?? "";
  if (category && !catalogue.categories.some(option => option.code === category)) throw new Error("دسته‌بندی پیدا نشد.");
  const onlyPhotos = params.get("photos") === "1";
  const sort = params.get("sort") ?? "name";
  if (!["name", "photos", "reviews"].includes(sort)) throw new Error("ترتیب نمایش معتبر نیست.");
  const limit = Number(params.get("limit") ?? 36);
  const requestedPage = Number(params.get("page") ?? 1);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 60 || !Number.isSafeInteger(requestedPage) || requestedPage < 1) {
    throw new Error("شماره یا اندازهٔ صفحه معتبر نیست.");
  }
  const matches = catalogue.entries.filter(({ card, search }) => (!category || card.categories.includes(category))
    && (!onlyPhotos || card.photo_count > 0) && compactTokens.every(token => search.includes(token) || search.replaceAll(" ", "").includes(token)));
  matches.sort((a, b) => (sort === "photos" ? b.card.photo_count - a.card.photo_count
    : sort === "reviews" ? b.card.review_count - a.card.review_count : 0) || collator.compare(a.card.name, b.card.name)
    || a.card.place_id.localeCompare(b.card.place_id));
  const pages = Math.max(1, Math.ceil(matches.length / limit));
  const page = Math.min(requestedPage, pages);
  return { items: matches.slice((page - 1) * limit, page * limit).map(entry => entry.card), total: matches.length, page, pages, limit };
}
