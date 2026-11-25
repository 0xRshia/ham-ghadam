import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const defaultDestination = fileURLToPath(new URL("../public/data/venues.json", import.meta.url));
const [source, destination = defaultDestination] = process.argv.slice(2);

if (!source || process.argv.length > 4) {
  console.error("Usage: node scripts/import-venues.mjs <data-panel invara.json or export directory> [destination]");
  process.exit(1);
}

const venueKinds = ["cafe", "restaurant"];
const menuHosts = [
  "eatpal.ir", "ezmenu.ir", "menudari.ir", "menudigital.ir", "menew.ir",
  "menusaz.com", "rhinomenu.com", "snapp-store.com", "topmenumarket.com",
];

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function text(value, maxLength) {
  if (typeof value !== "string") return undefined;
  return value.replace(/\s+/gu, " ")
    .replace(/[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu, "")
    .trim().slice(0, maxLength) || undefined;
}

function httpsUrl(value) {
  if (typeof value !== "string" || value.length > 2048 || !URL.canParse(value)) return undefined;
  const url = new URL(value);
  if (url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash) {
    return url;
  }
}

function menuUrl(value) {
  const url = httpsUrl(value);
  if (!url) return undefined;
  if (url.hostname === "snappfood.ir") {
    return /^\/restaurant\/menu\/[a-z0-9-]+\/?$/i.test(url.pathname) ? url.href : undefined;
  }
  if (menuHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    return url.href;
  }
}

function reviewRating(reviews) {
  if (!Array.isArray(reviews)) return undefined;
  let liked = 0;
  let reviewCount = 0;
  for (const review of reviews) {
    if (!["liked", "fine", "disliked"].includes(review?.reaction)) continue;
    reviewCount++;
    if (review.reaction === "liked") liked++;
  }
  return reviewCount ? { likedPercent: Math.round(100 * liked / reviewCount), reviewCount } : undefined;
}

function venuePhoto(value) {
  const url = httpsUrl(value);
  return url?.hostname === "media.invara.top" &&
    /^\/media\/place_photos\/photos\/[a-z0-9_-]+\.(?:avif|webp|jpe?g|png)$/i.test(url.pathname) ? url.href : undefined;
}

function profileExtras(row) {
  const photos = [...new Set((Array.isArray(row.photos) ? row.photos : [])
    .filter(photo => photo?.kind === "venue" && photo.role === "original" && photo.place_id === row.place_id)
    .sort((a, b) => a.position - b.position)
    .map(photo => venuePhoto(photo.url)).filter(Boolean))];
  const name = text(row.nearest_metro?.name, 100);
  const lines = [...new Set((Array.isArray(row.nearest_metro?.lines) ? row.nearest_metro.lines : [])
    .filter(line => Number.isInteger(line) && line > 0 && line <= 99))].sort((a, b) => a - b);
  return photos.length || name ? {
    photos: photos.length ? photos : undefined,
    metro: name ? { name, lines } : undefined,
  } : undefined;
}

function venue(row) {
  const id = row?.place_id;
  const name = text(row?.name, 160);
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || !name || !Array.isArray(row.categories)) {
    return undefined;
  }
  const kinds = venueKinds.filter(kind => row.categories.includes(kind));
  if (!kinds.length) return undefined;

  const lat = row.latitude;
  const lng = row.longitude;
  const coordinates = Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180
    ? { lat, lng }
    : {};
  const tags = Array.isArray(row.tags) ? [...new Set(row.tags.map(tag => tag?.code)
    .filter(code => typeof code === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(code)))].sort() : [];
  const priceLevel = Number.isInteger(row.price_level) && row.price_level >= 1 && row.price_level <= 4
    ? row.price_level
    : undefined;
  const detail = httpsUrl(row.source_url);
  const url = detail?.hostname === "invara.top" && detail.pathname === `/places/${id}` ? detail.href : undefined;
  const image = venuePhoto(row.cover_image_url);

  return {
    id,
    name,
    kinds,
    address: text(row.address, 320),
    ...coordinates,
    tags: tags.length ? tags : undefined,
    priceLevel,
    reviewRating: reviewRating(row.reviews),
    url,
    menuUrl: menuUrl(row.menu_url),
    image,
  };
}

let report, stores;
if ((await stat(source)).isDirectory()) {
  [report, stores] = await Promise.all([
    readJson(join(source, "run-report.json")),
    readJson(join(source, "stores.json")),
  ]);
} else {
  ({ report, stores } = await readJson(source));
}

if (report?.origin !== "https://invara.top" || !Array.isArray(stores) || report.exported_store_count !== stores.length) {
  throw new Error("The Invara report and venue records must come from the same data-panel export.");
}
const exportTime = typeof report.exported_at === "string" ? Date.parse(report.exported_at) : NaN;
if (!Number.isFinite(exportTime)) throw new Error("The data-panel export must include a valid export timestamp.");
const asOf = new Date(exportTime).toISOString();

const venues = new Map();
const extras = new Map();
for (const row of stores) {
  const result = venue(row);
  if (!result) continue;
  if (venues.has(result.id)) throw new Error(`The data-panel export has a duplicate public venue ID (${result.id}).`);
  venues.set(result.id, result);
  const profile = profileExtras(row);
  if (profile) extras.set(result.id, profile);
}
if (!venues.size) throw new Error("The data-panel export contains no public cafés or restaurants.");

const rows = [...venues.keys()].sort().map(id => JSON.stringify(venues.get(id)));
const output = `{"asOf":${JSON.stringify(asOf)},"venues":[\n${rows.join(",\n")}\n]}\n`;
const profiles = [...extras.keys()].sort().map(id => `${JSON.stringify(id)}:${JSON.stringify(extras.get(id))}`);
const detailOutput = `{"asOf":${JSON.stringify(asOf)},"profiles":{\n${profiles.join(",\n")}\n}}\n`;
await mkdir(dirname(destination), { recursive: true });
async function writeAtomic(path, contents) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
await writeAtomic(join(dirname(destination), "venue-profiles.json"), detailOutput);
await writeAtomic(destination, output);
console.log(`Imported ${rows.length} venues from the ${asOf} data-panel export.`);
