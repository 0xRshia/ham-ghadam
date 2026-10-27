import { codes, number, object, text } from "./model.js";
import type { Data, DomSnapshot, Photo, Store, Taxon } from "./model.js";

const URL_KEYS = new Set(["url", "image_url", "photo_url", "original_url", "thumbnail_url", "thumb_url", "full_url"]);

export function httpUrl(value: unknown, base?: string): string | null {
  if (!text(value)) return null;
  try {
    const url = new URL(String(value), base);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function photoRows(placeId: string, value: unknown, kind: Photo["kind"], reviewId: string | null = null): Photo[] {
  const result: Photo[] = [];
  const photos = Array.isArray(value) ? value : value ? [value] : [];
  photos.forEach((photo, position) => {
    if (typeof photo === "string") {
      const url = httpUrl(photo);
      if (url) result.push({ place_id: placeId, review_id: reviewId, kind, role: "original", position, url, raw: photo });
      return;
    }
    for (const [role, value] of Object.entries(object(photo))) {
      const url = URL_KEYS.has(role) ? httpUrl(value) : null;
      if (url) result.push({ place_id: placeId, review_id: reviewId, kind, role, position, url, raw: photo });
    }
  });
  return result;
}

export function uniquePhotos(photos: Photo[]): Photo[] {
  const unique = new Map<string, Photo>();
  for (const photo of photos) {
    const key = `${photo.kind}:${photo.review_id}:${photo.url}`;
    if (!unique.has(key)) unique.set(key, photo);
  }
  return [...unique.values()];
}

export function normalizeStore(input: {
  id: string; origin: string; detail: Data; listing: Data; page: DomSnapshot;
  reviews: Data[]; reviewPages: number; reviewsComplete: boolean; warnings: string[];
}): Store {
  const { id, origin, detail, listing, page } = input;
  if (text(detail.place_id) !== id) throw new Error(`Detail ID does not match ${id}`);
  const name = text(detail.name) ?? text(listing.name) ?? page.name;
  if (!name) throw new Error(`Missing name for ${id}`);
  const tagSource = Array.isArray(detail.tags) ? detail.tags : listing.tags;
  const tags: Taxon[] = (Array.isArray(tagSource) ? tagSource : []).flatMap(value => {
    const item = object(value);
    const code = text(item.code) ?? text(value);
    return code ? [{ kind: "tag" as const, code, label_fa: text(item.label), filterable: false, source: "place" }] : [];
  });
  const cover = httpUrl(detail.cover_image_url) ?? httpUrl(listing.cover_image_url);
  const reviews = [...new Map<string, Data>(input.reviews.map(review => [String(review.id), { ...review, place_id: id }])).values()];
  const photos = [
    ...photoRows(id, detail.photos, "venue"),
    ...photoRows(id, listing.photos, "venue"),
    ...[cover, httpUrl(listing.cover_image_url)].flatMap(url => url
      ? [{ place_id: id, review_id: null, kind: "venue" as const, role: "cover", position: -1, url, raw: null }] : []),
    ...page.photos.flatMap(url => [{ place_id: id, review_id: null, kind: "venue" as const, role: "rendered", position: -1, url, raw: null }]),
    ...reviews.flatMap(review => photoRows(id, review.images, "review", String(review.id))),
  ];
  const directionLink = page.links.find(link => link.url.includes("google.com/maps"));
  let mapCoordinates: string[] = [];
  if (directionLink) mapCoordinates = new URL(directionLink.url).searchParams.get("query")?.split(",") ?? [];
  return {
    place_id: id,
    source_url: new URL(`/places/${encodeURIComponent(id)}`, origin).href,
    fetched_at: new Date().toISOString(), name,
    address: text(detail.address) ?? text(listing.address),
    latitude: number(detail.latitude ?? listing.latitude ?? mapCoordinates[0]),
    longitude: number(detail.longitude ?? listing.longitude ?? mapCoordinates[1]),
    categories: codes(detail.categories ?? listing.categories), tags,
    price_level: number(detail.price_level ?? listing.price_level),
    cover_image_url: cover,
    menu_url: httpUrl(detail.menu_url) ?? page.links.find(link => /منو/.test(link.text))?.url ?? null,
    nearest_metro: detail.nearest_metro ?? listing.nearest_metro ?? null,
    photos: uniquePhotos(photos), reviews,
    review_pages: input.reviewPages, reviews_complete: input.reviewsComplete,
    raw_place: detail, raw_listing: listing, page, warnings: input.warnings,
  };
}

export function mergeTaxonomy(taxonomy: Taxon[], stores: Store[]): Taxon[] {
  const result = new Map<string, Taxon>();
  for (const item of taxonomy) result.set(`${item.kind}:${item.code}`, item);
  for (const store of stores) {
    for (const code of store.categories) {
      const key = `category:${code}`;
      if (!result.has(key)) result.set(key, { kind: "category", code, label_fa: null, filterable: false, source: "place" });
    }
    for (const tag of store.tags) {
      const key = `tag:${tag.code}`;
      if (!result.has(key)) result.set(key, tag);
    }
    for (const review of store.reviews) {
      for (const code of codes(review.dish_tags)) {
        const key = `food:${code}`;
        if (!result.has(key)) result.set(key, { kind: "food", code, label_fa: null, filterable: false, source: "review" });
      }
    }
  }
  return [...result.values()].sort((a, b) => `${a.kind}:${a.code}`.localeCompare(`${b.kind}:${b.code}`));
}
