import { parse } from "csv-parse/sync";
import { config } from "@/db";
import { ApiError } from "./server";
import { validateImageBytes, type ValidatedImage } from "./event-media";
import { MAX_IMAGE_BYTES } from "./media-policy";
import { normalizeInstagramProfile } from "./instagram-profile";
import { parseSheetSchedule, sheetExactTimes } from "./event-schedule";
import { LOCATION_URL_ERROR, parseLocationUrl, type LocationLink } from "./location-url";
import type { SheetEventWrite } from "./fast-events";

export const sheetHeaders = ["اسم ایونت", "آیدی", "تاریخ", "زمان", "شهر", "محل برگزاری", "برگزار کننده", "پوستر", "توضیحات", "ID"] as const;
export type SheetRow = Record<typeof sheetHeaders[number], string> & { "لینک نقشه"?: string; _row?: number };

export function sheetSource(value: unknown) {
  try {
    if (typeof value !== "string" || value.length > 2048 || /[\s\\\u0000-\u001f]/.test(value)) throw new Error();
    const url = new URL(value);
    const match = /^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/(?:edit|view|export))?\/?$/.exec(url.pathname);
    const gid = url.searchParams.get("gid") ?? new URLSearchParams(url.hash.slice(1)).get("gid") ?? "0";
    if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || url.port || url.username || url.password || !match || !/^\d+$/.test(gid)) throw new Error();
    return { url: `https://docs.google.com/spreadsheets/d/${match[1]}/edit?gid=${gid}`, csv: `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}` };
  } catch { throw new ApiError(400, "پیوند معتبر Google Sheets همراه با شناسهٔ برگه وارد کنید."); }
}

function allowedHost(url: URL, image: boolean) {
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  if (!image) return url.hostname === "docs.google.com" || url.hostname.endsWith("-sheets.googleusercontent.com");
  const extra = (config().EVENT_SYNC_IMAGE_HOSTS ?? "").split(",").map(host => host.trim().toLowerCase()).filter(host => /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(host) && !host.endsWith(".local") && !host.endsWith(".localhost"));
  return ["drive.google.com", "drive.usercontent.google.com", "lh3.googleusercontent.com", ...extra].includes(url.hostname);
}
async function publicBytes(initial: string, image: boolean, limit: number) {
  let url: URL;
  try { url = new URL(initial); } catch { throw new ApiError(400, "پیوند منبع معتبر نیست."); }
  const signal = AbortSignal.timeout(15000);
  for (let redirects = 0; redirects <= 4; redirects++) {
    if (!allowedHost(url, image)) throw new ApiError(400, "میزبان پیوند یا تغییر مسیر منبع مجاز نیست.");
    const response = await fetch(url, { redirect: "manual", signal, headers: { Accept: image ? "image/*" : "text/csv" }, cache: "no-store" });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new ApiError(400, "تغییر مسیر منبع معتبر نیست.");
      url = new URL(location, url);
      if (url.hostname === "accounts.google.com") throw new ApiError(502, `دریافت ${image ? "پوستر" : "شیت"} به ورود Google نیاز دارد؛ دسترسی «هر کسی که پیوند را دارد» را برای فایل فعال کنید.`);
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new ApiError(502, `دریافت ${image ? "پوستر" : "شیت"} ناموفق بود (HTTP ${response.status}). دسترسی عمومی را بررسی کنید.`); }
    if (/text\/html/i.test(response.headers.get("content-type") ?? "")) { await response.body?.cancel(); throw new ApiError(502, "منبع به‌جای فایل، صفحهٔ وب یا ورود برگرداند؛ دسترسی عمومی را بررسی کنید."); }
    if (Number(response.headers.get("content-length")) > limit) { await response.body?.cancel(); throw new ApiError(413, "حجم فایل منبع بیش از حد مجاز است."); }
    if (!response.body) throw new ApiError(502, "فایل منبع خالی است.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); throw new ApiError(413, "حجم فایل منبع بیش از حد مجاز است."); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  }
  throw new ApiError(502, "تعداد تغییر مسیرهای منبع بیش از حد مجاز است.");
}

export function parseSheetCsv(csv: string): SheetRow[] {
  let records: string[][];
  try { records = parse(csv, { bom: true, skip_empty_lines: true, max_record_size: 65536 }); }
  catch { throw new ApiError(400, "ساختار CSV شیت معتبر نیست."); }
  const headers = records.shift()?.map(header => header.trim()) ?? [];
  if (new Set(headers).size !== headers.length || sheetHeaders.some(header => !headers.includes(header))) throw new ApiError(400, "ستون‌های شیت ناقص یا تکراری‌اند؛ نام ستون‌ها باید مطابق راهنمای همگام‌سازی باشد.");
  const rows = records.map((cells,index) => ({cells,rowNumber:index+2})).filter(({cells}) => cells.some(cell => cell.trim()));
  if (rows.length > 1000) throw new ApiError(413, "هر برگه حداکثر هزار رویداد می‌تواند داشته باشد.");
  const seen = new Set<string>();
  return rows.map(({cells,rowNumber}) => {
    const row = {} as SheetRow;
    for (const header of sheetHeaders) row[header] = cells[headers.indexOf(header)];
    if (headers.includes("لینک نقشه")) row["لینک نقشه"] = cells[headers.indexOf("لینک نقشه")];
    Object.defineProperty(row,"_row",{value:rowNumber});
    row.ID = row.ID.trim().toLowerCase();
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(row.ID) || seen.has(row.ID)) throw new ApiError(400, `شناسهٔ UUID در ردیف ${rowNumber} نامعتبر یا تکراری است؛ هیچ رویدادی تغییر نکرد.`);
    seen.add(row.ID);
    return row;
  });
}
export async function fetchSheet(value: string) {
  const source = sheetSource(value);
  const bytes = await publicBytes(source.csv, false, 2 * 1024 * 1024);
  return parseSheetCsv(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
export async function fetchSheetPoster(value: string): Promise<ValidatedImage & { hash: string }> {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new ApiError(400, "پیوند پوستر معتبر نیست."); }
  if (url.hostname === "drive.google.com") {
    const id = /^\/file\/d\/([\w-]+)\/(?:view)?$/.exec(url.pathname)?.[1] ?? (url.pathname === "/open" || url.pathname === "/uc" ? url.searchParams.get("id") : null);
    if (!id || !/^[\w-]+$/.test(id) || url.protocol !== "https:" || url.username || url.password || url.port) throw new ApiError(400, "پیوند فایل Google Drive معتبر نیست.");
    url = new URL(`https://drive.google.com/uc?export=download&id=${id}`);
  }
  const bytes = await publicBytes(url.href, true, MAX_IMAGE_BYTES);
  const contentType = validateImageBytes(bytes);
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return { role: "cover", position: 0, bytes, contentType, hash };
}

export function sheetEventInput(row: SheetRow, year: number): { input: SheetEventWrite["input"]; schedule: SheetEventWrite["schedule"]; instagram: string | null; organizer: string } {
  function field(header: typeof sheetHeaders[number], max: number, multiline = false) {
    const value = (multiline ? row[header].replace(/\r\n?/g, "\n") : row[header].replace(/\s+/g, " ")).trim();
    if (!value || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new ApiError(400, `مقدار ستون «${header}» خالی، نامعتبر یا بیش از ${max} نویسه است.`);
    return value;
  }
  const placeLines = field("محل برگزاری", 420 + 2048 + 2, true).split("\n").map(line => line.trim()).filter(Boolean);
  let location: LocationLink | null = null;
  function addLocation(value: string) {
    const parsed = parseLocationUrl(value);
    if (!parsed) throw new ApiError(400, LOCATION_URL_ERROR);
    if (location && location.url !== parsed.url) throw new ApiError(400, "برای هر رویداد فقط یک لینک نقشه یا وب‌سایت محل یکسان وارد کنید؛ پیوندهای محل با هم متفاوت‌اند.");
    location = parsed;
  }
  if (row["لینک نقشه"]?.trim()) addLocation(row["لینک نقشه"].trim());
  const addressLines = placeLines.filter(line => {
    if (!/^(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/i.test(line)) return true;
    addLocation(line);
    return false;
  });
  const venue = addressLines.shift();
  if (!venue) throw new ApiError(400, "نام واقعی محل برگزاری را در خط اول وارد کنید؛ لینک نقشه به‌تنهایی نام محل نیست.");
  const address = addressLines.join("\n");
  if (venue.length > 120 || address.length > 300) throw new ApiError(400, "نام محل یا نشانی بیش از حد طولانی است؛ نام محل را در خط اول و نشانی را در خط‌های بعد بنویسید.");
  const schedule = parseSheetSchedule(field("تاریخ", 500, true), field("زمان", 500, true), year);
  const instagramText = row["آیدی"].trim().replace(/^instagram\s*:\s*/i, "").trim();
  const instagram = normalizeInstagramProfile(/^(NO ID|-)?$/i.test(instagramText) ? null : instagramText);
  if (instagram === undefined) throw new ApiError(400, "آیدی اینستاگرام معتبر نیست.");
  return { schedule, instagram, organizer: field("برگزار کننده", 100), input: {
    title: field("اسم ایونت", 120), description: field("توضیحات", 4000, true), city: field("شهر", 80), venue, address,
    category: "uncategorized", ...sheetExactTimes(schedule), registrationEnd: 0, price: 0, originalPrice: null, capacity: null,
    location: location ?? { url: null, lat: null, lng: null },
  } };
}
