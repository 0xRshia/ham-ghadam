import type { Data } from "../model.js";

export type EventSource = "jabama" | "davvvat";
export interface EventCategory { code: string; label: string; method: "source-category" | "title-rule" | "fallback"; evidence: string }
export interface EventPhoto { url: string; thumbnail_url: string | null; role: string; raw: unknown }
export interface EventRecord {
  event_id: string; source: EventSource; source_id: string; source_url: string; fetched_at: string;
  title: string; description: string; source_categories: { code: string; label: string | null }[];
  categories: EventCategory[]; city: string | null; city_code: string | null; area: string | null;
  venue: string | null; address: string | null; latitude: number | null; longitude: number | null;
  location_precision: "exact" | "approximate" | null; map_url: string | null;
  organizer: { name: string | null; url: string | null; avatar_url: string | null; raw: unknown };
  start_date: string | null; end_date: string | null; start_time: string | null; end_time: string | null;
  start_at: string | null; end_at: string | null; date_text: string | null; schedule_type: string | null;
  timezone: "Asia/Tehran"; sessions: Data[];
  price: { amount: number | null; currency: string | null; text: string | null; is_free: boolean | null; raw: unknown };
  status: string | null; duration: string | null; booking_url: string | null; tags: string[];
  photos: EventPhoto[]; videos: string[]; reviews: Data[]; terms: string | null;
  raw_event: Data; raw_page: Data; warnings: string[];
}
export interface EventInventory {
  source: EventSource; seed_url: string; discovered_at: string; complete: boolean;
  urls: string[]; listings: Record<string, Data>; audits: Data[]; robots_txt: string;
}
export const SOURCE_LABELS: Record<EventSource, string> = { jabama: "جاباما ایونت", davvvat: "دعوت" };
export const SOURCE_ORIGINS: Record<EventSource, string> = { jabama: "https://jabama.events", davvvat: "https://davvvat.ir" };
export const EVENT_CATEGORY_LABELS: Record<string, string> = {
  music: "کنسرت و موسیقی", theater: "تئاتر و نمایش", comedy: "استندآپ و کمدی", exhibition: "نمایشگاه و گالری",
  workshop: "کارگاه و آموزش", food: "غذا و آشپزی", social: "دورهمی و شبکه‌سازی", cinema: "سینما و فیلم",
  culture: "فرهنگ و ادبیات", sports: "ورزش و تندرستی", tour: "گردش و سفر", shopping: "بازار و خرید",
  games: "بازی و سرگرمی", museum: "موزه", online: "برخط", other: "سایر رویدادها",
  science: "علم و فناوری", family: "کودک و خانواده", business: "کسب‌وکار",
};

export function categorizeEvent(sourceCategories: { code: string; label: string | null }[], title: string, online = false): EventCategory[] {
  const result = new Map<string, EventCategory>();
  const add = (code: string, method: EventCategory["method"], evidence: string) => {
    if (!result.has(code)) result.set(code, { code, label: EVENT_CATEGORY_LABELS[code] ?? code, method, evidence });
  };
  const sourceRules: [string, RegExp][] = [
    ["music", /concert|music|کنسرت|موسیقی/i], ["theater", /theat|drama|تئاتر|تاتر|نمایشنامه/i],
    ["comedy", /comedy|stand.?up|کمدی/i], ["exhibition", /gallery|exhibition|گالری|نمایشگاه/i],
    ["workshop", /^(workshop|pottery|art-crafts)$|آموزش|سفالگری/i], ["food", /cooking|culinary|آشپزی/i],
    ["sports", /sport|wellness|fitness|yoga|ورزش|یوگا/i], ["tour", /tour|travel|گردش|سفر/i],
    ["shopping", /shopping|market|بازار|خرید/i], ["games", /games?|boardgame|بازی/i],
    ["museum", /museum|موزه/i], ["cinema", /cinema|film|سینما|فیلم/i], ["culture", /literature|book|فرهنگ|ادبیات/i],
    ["science", /science|technology|علم|فناوری/i], ["family", /family|children|کودک|خانواده/i], ["business", /business|کسب.?و.?کار/i],
    ["social", /meetup|networking|social|دورهمی/i], ["online", /^online$|^virtual$/i],
  ];
  for (const category of sourceCategories) for (const [code, pattern] of sourceRules) {
    if (pattern.test(`${category.code} ${category.label ?? ""}`) || pattern.test(category.code)) add(code, "source-category", category.code);
  }
  const titleRules: [string, RegExp][] = [
    ["comedy", /استند\s*آپ|استنداپ|استند.?اپ|کمدی|کمدین/], ["music", /کنسرت|موسیقی|موزیک|آواز|ارکستر/],
    ["theater", /تئاتر|تاتر|نمایش(?!گاه)|نمایشنامه/], ["exhibition", /نمایشگاه|نگارخانه|گالری/],
    ["workshop", /ورک\s*شاپ|ورکشاپ|کارگاه|کلاس|آموزش|مسترکلاس|سفالگری/],
    ["cinema", /فیلم|سینما|اکران/], ["culture", /شعر|کتابخوانی|کتاب‌خوانی|ادبیات|فلسفه|نشست|گفتگو|گفت‌وگو/],
    ["food", /آشپزی|شکلات|پخت|قهوه|پیتزا|کوکی|کیک|شیرینی|غذا/],
    ["social", /دورهمی|دور همی|شبکه.?سازی|گپ.?و.?گفت|میت.?آپ/], ["sports", /یوگا|ورزش|مدیتیشن|تندرستی|کوهنوردی/],
    ["tour", /گشت|گردش|تور\s|پیاده.?گردی|طبیعت.?گردی/], ["shopping", /بازارچه|بازار|خرید|پاپ.?آپ/],
    ["games", /بردگیم|بازی|مافیا|شطرنج/], ["museum", /موزه/], ["online", /وبینار|آنلاین|برخط/],
  ];
  for (const [code, pattern] of titleRules) {
    // Gallery titles such as «نمایش انفرادی» describe an exhibition, not a play.
    if (code === "theater" && result.has("exhibition")) continue;
    if (pattern.test(title)) add(code, "title-rule", title);
  }
  if (online) add("online", "source-category", "online mode");
  if (!result.size) add("other", "fallback", "No matching source category or title rule");
  return [...result.values()];
}
