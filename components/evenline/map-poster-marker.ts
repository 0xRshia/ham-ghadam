import type { EventItem } from "@/lib/types";
import { distanceKm, fa } from "@/lib/types";
import { categoryCopy, copy } from "@/locales/fa";

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

// Use DOM nodes rather than HTML strings: catalog titles and URLs are external data.
// The legacy helper name is kept because both map providers share this renderer.
export function createMapPoster(items: EventItem[], selected: string | null, point?: Point | null) {
  const representative = items.find(event => event.id === selected) ?? items[0];
  const button = document.createElement("button");
  button.type = "button";
  button.className = `el-minimal-pin el-map-category-pin${items.length > 1 ? " el-map-cluster" : ""}`;
  button.dir = "rtl";
  button.dataset.eventCount = String(items.length);
  button.setAttribute("aria-pressed", String(items.some(event => event.id === selected)));
  const appearance = categoryMarkers[representative.category] ?? defaultMarker;
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
    : categoryCopy.find(category => category.id === representative.category)?.label ?? copy.events;
  button.appendChild(label);

  const titles = [representative, ...items.filter(event => event.id !== representative.id)].map(event => event.title).join("؛ ");
  const description = [titles,
    ...(items.length > 1 ? [`${fa(items.length)} ${copy.mapClusterEvents}`] : []),
    ...(distance !== null ? [`${copy.approximateDistance} ${label.textContent}`] : []),
  ].join("؛ ");
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
