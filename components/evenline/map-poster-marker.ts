import type { EventItem } from "@/lib/types";
import { fa } from "@/lib/types";
import { copy } from "@/locales/fa";

// Use DOM nodes rather than HTML strings: catalog titles and URLs are external data.
export function createMapPoster(items: EventItem[], selected: string | null) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `el-minimal-pin el-map-poster-pin${items.length > 1 ? " el-map-cluster" : ""}`;
  button.dataset.eventCount = String(items.length);
  button.setAttribute("aria-label", items.length > 1 ? `${items[0].title}؛ ${fa(items.length)} ${copy.mapClusterEvents}` : items[0].title);
  button.setAttribute("aria-pressed", String(items.some(event => event.id === selected)));
  const representative = items.find(event => event.id === selected) ?? items[0];
  const visible = [representative, ...items.filter(event => event.id !== representative.id)].slice(0, 3);
  visible.reverse().forEach((event, index) => {
    const frame = document.createElement("span");
    frame.className = `el-map-poster-frame${index === visible.length - 1 ? " el-map-poster-front" : ""}`;
    frame.style.setProperty("--poster-depth", String(visible.length - index - 1));
    const fallback = document.createElement("span");
    fallback.className = "el-map-poster-fallback";
    fallback.textContent = event.title.trim().slice(0, 1) || "◈";
    frame.appendChild(fallback);
    const source = event.thumbnail || event.image;
    if (source) {
      const img = document.createElement("img");
      img.src = source; img.alt = ""; img.draggable = false; img.decoding = "async";
      img.addEventListener("error", () => img.remove(), { once: true });
      frame.appendChild(img);
    }
    button.appendChild(frame);
  });
  if (items.length > 1) {
    const count = document.createElement("span");
    count.className = "el-map-poster-count"; count.textContent = fa(items.length);
    button.appendChild(count);
  }
  return button;
}
