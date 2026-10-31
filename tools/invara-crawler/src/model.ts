export type Data = Record<string, unknown>;

export interface Taxon {
  kind: "category" | "food" | "tag";
  code: string;
  label_fa: string | null;
  filterable: boolean;
  source: string;
}

export interface Photo {
  place_id: string;
  review_id: string | null;
  kind: "venue" | "review";
  role: string;
  position: number;
  url: string;
  raw: unknown;
}

export interface DomSnapshot {
  title: string;
  name: string;
  text: string;
  links: { text: string; url: string }[];
  photos: string[];
  meta: Record<string, string>;
}

export interface Store {
  place_id: string;
  source_url: string;
  fetched_at: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  categories: string[];
  tags: Taxon[];
  price_level: number | null;
  cover_image_url: string | null;
  menu_url: string | null;
  nearest_metro: unknown;
  photos: Photo[];
  reviews: Data[];
  review_pages: number;
  reviews_complete: boolean;
  raw_place: Data;
  raw_listing: Data;
  page: DomSnapshot;
  warnings: string[];
}

export interface Capture {
  url: string;
  status: number;
  observed_at: string;
  retry_after?: string | null;
  body: unknown;
}

export interface Failure {
  place_id: string | null;
  phase: string;
  message: string;
  occurred_at: string;
}

export interface Discovery {
  scope?: "sample" | "all_public";
  exhausted?: boolean;
  searches?: SearchCoverage[];
  origin: string;
  seed_url: string;
  discovered_at: string;
  ids: string[];
  listings: Record<string, Data>;
  pages: Capture[];
  taxonomy: Taxon[];
  robots_txt: string;
}

export interface SearchCoverage {
  unavailable_reason?: string;
  url: string;
  kind: "list" | "map";
  page_numbers: number[];
  place_ids: string[];
  exhausted: boolean;
  last_next_page: number | null;
  error: string | null;
}

export function object(value: unknown): Data {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Data : {};
}

export function items(value: unknown): Data[] {
  const body = object(value);
  const list = Array.isArray(value) ? value : body.items;
  return Array.isArray(list) ? list.map(object) : [];
}

export function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function number(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function codes(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap(item => {
    const code = typeof item === "string" ? item : text(object(item).code);
    return code ? [code] : [];
  }) : [];
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
