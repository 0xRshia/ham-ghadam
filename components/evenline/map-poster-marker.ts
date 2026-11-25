import { distanceKm, fa } from "@/lib/types";
import { categoryCopy, copy } from "@/locales/fa";

export type MapMarkerItem = {
  id: string;
  title: string;
  category: string;
  lat: number | null;
  lng: number | null;
  kind?: "venue";
};

type Point = { lat: number; lng: number };
const categoryMarkers: Record<string, { source: string; color: string }> = {
  music: { source: "/icons/vuesax/music.svg", color: "#16b8a6" },
  art: { source: "/icons/vuesax/brush.svg", color: "#ff8142" },
  books: { source: "/icons/vuesax/book.svg", color: "#8b6ef3" },
  games: { source: "/icons/vuesax/game.svg", color: "#409be8" },
  coffee: { source: "/icons/vuesax/coffee.svg", color: "#e49349" },
  halloween: { source: "/icons/ghost.svg", color: "#a16af0" },
};
const defaultMarker = { source: "/icons/vuesax/location.svg", color: "#ff8142" };
const defaultVenueMarker = { ...defaultMarker, label: "کافه یا رستوران" };
const venueMarkers = new Map([
  ["cafe", { ...categoryMarkers.coffee, label: "کافه" }],
  ["restaurant", { source: "/icons/restaurant.svg", color: "#ba5769", label: "رستوران" }],
]);

// Both map providers use DOM nodes to keep external catalog titles as text.
export function createMapPoster(items: readonly MapMarkerItem[], selected: string | null, point?: Point | null) {
  const selectedItem = items.find(item => item.id === selected);
  const representative = selectedItem ?? items[0];
  const venueCount = items.filter(item => item.kind === "venue").length;
  const eventCount = items.length - venueCount;
  const venueAppearance = representative.kind === "venue"
    ? venueMarkers.get(representative.category) ?? defaultVenueMarker
    : null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `el-minimal-pin el-map-category-pin${items.length > 1 ? " el-map-cluster" : ""}`;
  button.dir = "rtl";
  if (eventCount) button.dataset.eventCount = String(eventCount);
  if (venueCount) button.dataset.venueCount = String(venueCount);
  if (venueAppearance) button.dataset.venueCategory = representative.category;
  button.setAttribute("aria-pressed", String(Boolean(selectedItem)));
  const appearance = venueAppearance ?? categoryMarkers[representative.category] ?? defaultMarker;
  button.style.setProperty("--el-map-marker-color", appearance.color);
  const badge = document.createElement("span");
  badge.className = "el-map-category-badge";
  badge.setAttribute("aria-hidden", "true");
  const icon = document.createElement("span");
  icon.className = "el-vuesax-icon";
  icon.style.maskImage = `url("${appearance.source}")`;
  icon.style.webkitMaskImage = `url("${appearance.source}")`;
  badge.appendChild(icon);
  button.appendChild(badge);

  const distance = point && Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && representative.lat !== null && representative.lng !== null
    && Number.isFinite(representative.lat) && Number.isFinite(representative.lng)
    ? distanceKm(point.lat, point.lng, representative.lat, representative.lng) : null;
  const label = document.createElement("span");
  label.className = "el-map-category-distance";
  label.setAttribute("aria-hidden", "true");
  label.textContent = distance !== null
    ? `${fa(Math.round(distance * 10) / 10)} ${copy.kilometers}`
    : venueAppearance?.label ?? categoryCopy.find(category => category.id === representative.category)?.label ?? copy.events;
  button.appendChild(label);

  const otherItems = items.filter(item => item.id !== representative.id);
  const namedItems = venueCount ? otherItems.slice(0, 2) : otherItems;
  const titles = [representative, ...namedItems].map(item => item.title).join("؛ ");
  const descriptionParts = [titles];
  if (items.length > 1) {
    if (venueCount) {
      if (eventCount) descriptionParts.push(`${fa(eventCount)} رویداد`);
      descriptionParts.push(`${fa(venueCount)} مکان؛ برای دیدن جزئیات بزرگ‌نمایی کن`);
    } else {
      descriptionParts.push(`${fa(eventCount)} ${copy.mapClusterEvents}`);
    }
  } else if (venueAppearance) {
    descriptionParts.push(venueAppearance.label);
  }
  if (distance !== null) descriptionParts.push(`${copy.approximateDistance} ${label.textContent}`);
  const description = descriptionParts.join("؛ ");
  button.setAttribute("aria-label", description);
  button.title = description;
  if (items.length > 1) {
    const count = document.createElement("span");
    count.className = "el-map-category-count";
    count.setAttribute("aria-hidden", "true");
    count.textContent = fa(items.length);
    button.appendChild(count);
  }
  return button;
}
