"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import type { MapConfiguration } from "@/lib/map-configuration";
import type { EventItem } from "@/lib/types";
import { createMapPoster } from "./map-poster-marker";
import { clusterMapEvents } from "@/lib/map-clusters";
import { ensureMapRtl } from "@/lib/map-rtl";
import { copy } from "@/locales/fa";

type Point = { lat: number; lng: number };
type MapEvent = EventItem & Point;
type Runtime = { map: MapLibreMap; sdk: typeof import("maplibre-gl"); active: boolean };
const emptyEvents: MapEvent[] = [];

export function MinimalMapCanvas({ configuration, view, events = emptyEvents, selected = null, onSelect, onMove, interactive = true, showPoint = false, selectLocation = false }: {
  configuration: MapConfiguration;
  view: { points: Point[]; zoom?: number; initial?: boolean };
  events?: MapEvent[];
  selected?: string | null;
  onSelect?: (id: string) => void;
  onMove?: (point: Point) => void;
  interactive?: boolean;
  showPoint?: boolean;
  selectLocation?: boolean;
}) {
  const element = useRef<HTMLDivElement & HTMLSpanElement>(null);
  const callbacks = useRef({ onSelect, onMove, selectLocation });
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const theme = useRef(dark);
  const appliedStyle = useRef("");
  const initialApplied = useRef(false);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [failed, setFailed] = useState(false);
  const { styleUrl, darkStyleUrl } = configuration;
  useEffect(() => { callbacks.current = { onSelect, onMove, selectLocation }; }, [onSelect, onMove, selectLocation]);
  useEffect(() => { theme.current = dark; }, [dark]);

  useEffect(() => {
    let active = true, started = false;
    let instance: Runtime | undefined;
    let resize: ResizeObserver | undefined;
    const start = () => {
      if (started) return;
      started = true;
      void import("maplibre-gl").then(async sdk => {
        await ensureMapRtl(sdk);
        if (!active || !element.current || !styleUrl) return;
        const style = theme.current ? darkStyleUrl ?? styleUrl : styleUrl;
        const map = new sdk.Map({ container: element.current, style, center: [53, 32], zoom: 4,
          maxZoom: 18, interactive, attributionControl: false, dragRotate: false,
          pitchWithRotate: false, touchPitch: false,
          locale: { "NavigationControl.ZoomIn": copy.mapZoomIn, "NavigationControl.ZoomOut": copy.mapZoomOut, "Map.Title": copy.map } });
        map.touchZoomRotate.disableRotation();
        initialApplied.current = false;
        appliedStyle.current = style;
        instance = { map, sdk, active: true };
        map.addControl(new sdk.AttributionControl({ compact: true }), "bottom-left");
        map.on("style.load", () => {
          // Hide route-number shields while preserving street and place names.
          for (const layer of map.getStyle().layers) {
            if (layer.type === "symbol" && (/shield/i.test(layer.id) || layer.id === "highway_name_motorway")) map.setLayoutProperty(layer.id, "visibility", "none");
          }
        });
        map.once("load", () => {
          const attribution = element.current?.querySelector<HTMLDetailsElement>(".maplibregl-ctrl-attrib");
          attribution?.classList.remove("maplibregl-compact-show");
          attribution?.removeAttribute("open");
        });
        if (interactive) {
          map.on("click", event => { if (callbacks.current.selectLocation) map.jumpTo({ center: event.lngLat }); });
        } else map.getCanvas().tabIndex = -1;
        map.on("moveend", () => {
          const center = map.getCenter().wrap();
          callbacks.current.onMove?.({ lat: center.lat, lng: center.lng });
        });
        map.on("error", () => { if (active) setFailed(true); });
        map.on("idle", () => { if (active && map.areTilesLoaded()) setFailed(false); });
        resize = new ResizeObserver(() => map.resize());
        resize.observe(element.current);
        setRuntime(instance);
      }).catch(() => { if (active) setFailed(true); });
    };
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); start(); }
    });
    if (interactive) start(); else if (element.current) observer.observe(element.current);
    return () => {
      active = false; observer.disconnect(); resize?.disconnect();
      if (instance) { instance.active = false; instance.map.remove(); }
    };
  }, [styleUrl, darkStyleUrl, interactive]);

  useEffect(() => {
    const next = dark ? darkStyleUrl ?? styleUrl : styleUrl;
    if (runtime?.active && next && appliedStyle.current !== next) {
      appliedStyle.current = next;
      runtime.map.setStyle(next);
    }
  }, [runtime, dark, styleUrl, darkStyleUrl]);

  useEffect(() => {
    if (!runtime?.active || !view.points.length || (view.initial && initialApplied.current)) return;
    initialApplied.current = true;
    const points = view.points.map(point => [point.lng, point.lat] as [number, number]);
    if (view.zoom !== undefined) runtime.map.jumpTo({ center: points[0], zoom: view.zoom });
    else {
      const bounds = new runtime.sdk.LngLatBounds(points[0], points[0]);
      points.forEach(point => bounds.extend(point));
      runtime.map.fitBounds(bounds, { padding: { top: 80, bottom: 112, left: 56, right: 56 }, maxZoom: 14, duration: 0 });
    }
  }, [runtime, view]);

  useEffect(() => {
    if (!runtime?.active) return;
    const { map, sdk } = runtime;
    let pins: Marker[] = [];
    const render = () => {
      pins.forEach(pin => pin.remove());
      pins = [];
      for (const cluster of clusterMapEvents(events, event => map.project([event.lng, event.lat]), 76)) {
        const { items } = cluster;
        const grouped = items.length > 1;
        const button = createMapPoster(items, selected);
        const select = () => {
          map.getCanvas().focus({ preventScroll: true });
          if (grouped && map.getZoom() < 17) {
            map.jumpTo({ center: [cluster.lng, cluster.lat], zoom: Math.min(17, map.getZoom() + 3) });
          } else {
            map.jumpTo({ center: [items[0].lng, items[0].lat], zoom: Math.max(14, map.getZoom()) });
          }
          callbacks.current.onSelect?.(items.find(event => event.id === selected)?.id ?? items[0].id);
        };
        button.addEventListener("click", event => { event.stopPropagation(); select(); });
        button.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); select(); }
        });
        pins.push(new sdk.Marker({ element: button }).setLngLat([cluster.lng, cluster.lat]).addTo(map));
      }
    };
    render();
    map.on("moveend", render);
    return () => { map.off("moveend", render); pins.forEach(pin => pin.remove()); };
  }, [runtime, events, selected]);

  useEffect(() => {
    if (!runtime?.active || !showPoint || !view.points[0]) return;
    const point = view.points[0];
    const dot = document.createElement("span"); dot.className = "el-map-preview-point";
    dot.setAttribute("aria-hidden", "true");
    const marker = new runtime.sdk.Marker({ element: dot }).setLngLat([point.lng, point.lat]).addTo(runtime.map);
    return () => { marker.remove(); };
  }, [runtime, showPoint, view]);

  const Container = interactive ? "div" : "span";
  return <><Container ref={element} className={interactive ? "el-map-canvas" : "el-map-preview"} role="region" aria-label={copy.map} dir="ltr" />
    {failed && <span className={interactive ? "el-map-warning" : "el-preview-error"} role="status">{copy.mapUnavailable}</span>}</>;
}
