import type { MapConfiguration } from "./map-configuration";

// These are the credits supplied by the OpenFreeMap styles. Rendering them once
// avoids repeating the style/source credits and the app's preview footer.
export function mapCredits(configuration: MapConfiguration) {
  return configuration.styleUrl ? [
    { label: "OpenFreeMap", url: "https://openfreemap.org/" },
    { label: "© OpenMapTiles", url: "https://www.openmaptiles.org/" },
    { label: "© OpenStreetMap", url: "https://www.openstreetmap.org/copyright" },
  ] : [{ label: configuration.attributionLabel, url: configuration.attributionUrl }];
}

export function mapAttributionControl(configuration: MapConfiguration) {
  let element: HTMLDivElement | undefined;
  return {
    onAdd() {
      element = document.createElement("div");
      element.className = "maplibregl-ctrl maplibregl-ctrl-attrib";
      element.dir = "ltr";
      element.setAttribute("aria-label", "منابع نقشه");
      for (const [index, credit] of mapCredits(configuration).entries()) {
        if (index) element.appendChild(document.createTextNode(" · "));
        const link = document.createElement("a");
        link.href = credit.url;
        link.textContent = credit.label;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        element.appendChild(link);
      }
      return element;
    },
    onRemove() { element?.remove(); element = undefined; },
  };
}
