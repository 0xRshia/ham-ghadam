"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import type { Map as NeshanMap } from "@neshan-maps-platform/maplibre-sdk";
import type { Marker } from "maplibre-gl";
import type { MapConfiguration } from "@/lib/map-configuration";
import type { EventItem } from "@/lib/types";
import { copy } from "@/locales/fa";
import icons from "./source-icons.json";

type Point = { lat: number; lng: number };
type MapEvent = EventItem & Point;
type Runtime = { map: NeshanMap; sdk: typeof import("@neshan-maps-platform/maplibre-sdk")["default"]; active: boolean };
const emptyEvents: MapEvent[] = [];
const styleUrl = (dark: boolean) => `https://static.neshan.org/sdk/maplibre/styles/${dark ? "dark" : "light"}.json`;

export function NeshanMapCanvas({ configuration, view, events = emptyEvents, selected = null, onSelect, onMove, interactive = true, showPoint = false }: {
  configuration: MapConfiguration;
  view: { points: Point[]; zoom?: number };
  events?: MapEvent[];
  selected?: string | null;
  onSelect?: (id: string) => void;
  onMove?: (point: Point) => void;
  interactive?: boolean;
  showPoint?: boolean;
}) {
  const element = useRef<HTMLDivElement & HTMLSpanElement>(null);
  const callbacks = useRef({ onSelect, onMove });
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const theme = useRef(dark);
  const appliedStyle = useRef("");
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { callbacks.current = { onSelect, onMove }; }, [onSelect, onMove]);
  useEffect(() => { theme.current = dark; }, [dark]);

  useEffect(() => {
    let active = true, started = false;
    let instance: Runtime | undefined;
    let resize: ResizeObserver | undefined;
    const start = () => {
      if (started) return;
      started = true;
      void import("@neshan-maps-platform/maplibre-sdk").then(({ default: sdk }) => {
        if (!active || !element.current || !configuration.neshanKey) return;
        const map = new sdk.Map({ container: element.current, apiKey: configuration.neshanKey,
          style: styleUrl(theme.current), center: [53, 32], zoom: 4, maxZoom: 19,
          interactive, logoPosition: "bottom-left", copyRightPosition: "bottom-right" });
        appliedStyle.current = styleUrl(theme.current);
        if (!interactive) map.getCanvas().tabIndex = -1;
        instance = { map, sdk, active: true };
        if (interactive) map.addControl(new sdk.NavigationControl({ showCompass: false }), "top-left");
        map.on("moveend", () => { const center = map.getCenter().wrap(); callbacks.current.onMove?.({ lat: center.lat, lng: center.lng }); });
        map.on("error", () => { if (active) setFailed(true); });
        map.on("idle", () => { if (active && map.areTilesLoaded()) setFailed(false); });
        resize = new ResizeObserver(() => map.resize());
        resize.observe(element.current);
        setRuntime(instance);
      }).catch(() => { if (active) setFailed(true); });
    };
    const visible = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { visible.disconnect(); start(); } });
    if (interactive) start(); else if (element.current) visible.observe(element.current);
    return () => { active = false; visible.disconnect(); resize?.disconnect(); if (instance) { instance.active = false; instance.map.remove(); } };
  }, [configuration.neshanKey, interactive]);

  useEffect(() => { const next = styleUrl(dark); if (runtime?.active && appliedStyle.current !== next) { appliedStyle.current = next; runtime.map.setStyle(next); } }, [runtime, dark]);
  useEffect(() => {
    if (!runtime?.active || !view.points.length) return;
    const points = view.points.map(p => [p.lng, p.lat] as [number, number]);
    if (view.zoom !== undefined) runtime.map.jumpTo({ center: points[0], zoom: view.zoom });
    else {
      const bounds = new runtime.sdk.LngLatBounds(points[0], points[0]);
      points.forEach(p => bounds.extend(p));
      runtime.map.fitBounds(bounds, { padding: { top: 56, bottom: 56, left: 44, right: 44 }, maxZoom: 14, duration: 0 });
    }
  }, [runtime, view]);

  useEffect(() => {
    if (!runtime?.active || !showPoint || !view.points[0]) return;
    const point = view.points[0];
    const dot = document.createElement("span"); dot.className = "el-neshan-location";
    const marker = new runtime.sdk.Marker({ element: dot }).setLngLat([point.lng, point.lat]).addTo(runtime.map);
    dot.tabIndex = -1; dot.removeAttribute("role"); dot.setAttribute("aria-hidden", "true");
    return () => { marker.remove(); };
  }, [runtime, showPoint, view]);

  useEffect(() => {
    if (!runtime?.active) return;
    const pins: Marker[] = [];
    for (const event of events) {
      const name = event.category === "music" ? "music" : event.category === "art" ? "palette" : "map-pin";
      const button = document.createElement("button");
      button.type = "button"; button.className = "el-neshan-pin"; button.title = event.title;
      button.setAttribute("aria-label", event.title); button.setAttribute("aria-pressed", String(event.id === selected));
      const marker = document.createElement("span");
      marker.className = `el-map-marker el-map-marker-${name}${event.id === selected ? " is-selected" : ""}`; marker.dir = "rtl";
      const symbol = document.createElement("span"); symbol.className = "el-map-marker-symbol";
      for (const mode of ["light", "dark"] as const) {
        const image = document.createElement("img"); image.src = icons[35][name][0][mode].src;
        image.width = 16; image.height = 16; image.alt = ""; image.className = `el-${mode}-asset`; symbol.appendChild(image);
      }
      const label = document.createElement("span"); label.textContent = event.venue;
      marker.appendChild(symbol); marker.appendChild(label); button.appendChild(marker);
      button.addEventListener("click", () => { callbacks.current.onSelect?.(event.id); runtime.map.jumpTo({ center: [event.lng, event.lat] }); });
      button.style.zIndex = event.id === selected ? "2" : "1";
      pins.push(new runtime.sdk.Marker({ element: button }).setLngLat([event.lng, event.lat]).addTo(runtime.map));
    }
    return () => { pins.forEach(pin => pin.remove()); };
  }, [runtime, events, selected]);

  const Container = interactive ? "div" : "span";
  return <><Container ref={element} className={interactive ? "el-map-canvas" : "el-map-preview"} role="region" aria-label={copy.map} dir="ltr" />{failed && <span className={interactive ? "el-map-warning" : "el-preview-error"} role="status">{copy.mapUnavailable}</span>}</>;
}
