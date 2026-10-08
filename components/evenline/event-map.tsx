"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { useAppNavigate } from "@/components/event/app-navigation";
import { useEventBrowse } from "@/components/event/event-browse-provider";
import { useEventCatalog } from "@/hooks/use-event-catalog";
import { useDeadlineClock } from "@/hooks/use-deadline-clock";
import { defaultCatalogFilters, filterEvents } from "@/lib/event-catalog";
import type { MapConfiguration } from "@/lib/map-configuration";
import { fa, type EventItem } from "@/lib/types";
import { copy, categoryCopy } from "@/locales/fa";
import { FigmaIcon } from "./source-icon";
import { EventCard } from "./event-card";
import { Button, Header, ErrorState, LoadingState } from "./primitives";
import icons from "./source-icons.json";

type Point = { lat: number; lng: number };
type MappedEvent = EventItem & Point & { distance?: number };
type MapView = { points: Point[]; zoom?: number };
type MapRuntime = { active: boolean; map: Leaflet.Map; leaflet: typeof Leaflet; markers: Leaflet.LayerGroup; pins: Map<string, Leaflet.Marker> };
const hasCoordinates = <T extends EventItem>(event: T): event is T & Point =>
  event.lat !== null && event.lng !== null && Number.isFinite(event.lat) && Number.isFinite(event.lng);

function MapCanvas({ events, configuration, view, selected, onSelect, onMove }: {
  events: MappedEvent[];
  configuration: MapConfiguration;
  view: MapView;
  selected: string | null;
  onSelect: (id: string) => void;
  onMove: (point: Point) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onSelect, onMove });
  const [runtime, setRuntime] = useState<MapRuntime | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { callbacks.current = { onSelect, onMove }; }, [onSelect, onMove]);
  useEffect(() => {
    let active = true;
    let map: Leaflet.Map | undefined;
    let instance: MapRuntime | undefined;
    let observer: ResizeObserver | undefined;
    void import("leaflet").then(L => {
      if (!active || !container.current) return;
      map = L.map(container.current, { zoomControl: false, attributionControl: false });
      // A neutral world view remains usable when no catalog coordinates are available.
      map.setView([0, 0], 2);
      L.control.zoom({ position: "topleft", zoomInTitle: copy.mapZoomIn, zoomOutTitle: copy.mapZoomOut }).addTo(map);
      const attribution = document.createElement("a");
      attribution.href = configuration.attributionUrl;
      attribution.textContent = configuration.attributionLabel;
      attribution.target = "_blank";
      attribution.rel = "noopener noreferrer";
      L.control.attribution({ prefix: false, position: "bottomleft" }).addTo(map).addAttribution(attribution.outerHTML);
      const tiles = L.tileLayer(configuration.tileUrl, { maxZoom: 19, keepBuffer: 1, updateWhenIdle: true });
      tiles.on("tileerror", () => { if (active) setFailed(true); });
      tiles.on("tileload", () => { if (active) setFailed(false); });
      tiles.addTo(map);
      map.on("moveend", () => {
        const center = map!.getCenter().wrap();
        callbacks.current.onMove({ lat: center.lat, lng: center.lng });
      });
      observer = new ResizeObserver(() => map?.invalidateSize({ pan: false }));
      observer.observe(container.current);
      instance = { active: true, map, leaflet: L, markers: L.layerGroup().addTo(map), pins: new Map() };
      setRuntime(instance);
    }).catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      if (instance) instance.active = false;
      observer?.disconnect(); map?.remove();
    };
  }, [configuration]);

  // Update markers independently so typing and selecting a result preserve the viewport.
  useEffect(() => {
    if (!runtime?.active) return;
    const { map, leaflet: L, markers } = runtime;
    markers.clearLayers();
    runtime.pins.clear();
    for (const event of events) {
      const iconName = event.category === "music" ? "music" : event.category === "art" ? "palette" : "map-pin";
      const marker = document.createElement("span");
      marker.className = `el-map-marker el-map-marker-${iconName}`;
      marker.dir = "rtl";
      const symbol = document.createElement("span");
      symbol.className = "el-map-marker-symbol";
      for (const theme of ["light", "dark"] as const) {
        const img = document.createElement("img");
        img.src = icons[35][iconName][0][theme].src;
        img.width = 16; img.height = 16; img.alt = ""; img.className = `el-${theme}-asset`;
        symbol.appendChild(img);
      }
      const label = document.createElement("span");
      label.textContent = event.venue;
      marker.appendChild(symbol);
      marker.appendChild(label);
      const selectEvent = () => {
        callbacks.current.onSelect(event.id);
        map.panTo([event.lat, event.lng], { animate: false });
      };
      const pin = L.marker([event.lat, event.lng], {
        title: event.title, alt: event.title, keyboard: true,
        icon: L.divIcon({ html: marker, className: "el-map-pin", iconSize: [44, 44], iconAnchor: [22, 22] }),
      }).addTo(markers).on("click", selectEvent);
      const element = pin.getElement();
      element?.setAttribute("aria-label", event.title);
      element?.addEventListener("keydown", key => {
        if (key.key !== "Enter" && key.key !== " ") return;
        key.preventDefault(); key.stopPropagation();
        selectEvent();
      });
      runtime.pins.set(event.id, pin);
    }
    return () => { markers.clearLayers(); };
  }, [runtime, events]);

  useEffect(() => {
    if (!runtime?.active) return;
    runtime.pins.forEach((pin, id) => {
      pin.setZIndexOffset(id === selected ? 1000 : 0);
      pin.getElement()?.setAttribute("aria-pressed", String(id === selected));
      pin.getElement()?.querySelector(".el-map-marker")?.classList.toggle("is-selected", id === selected);
    });
  }, [runtime, events, selected]);

  useEffect(() => {
    if (!runtime?.active || !view.points.length) return;
    const points = view.points.map(point => [point.lat, point.lng] as [number, number]);
    if (view.zoom !== undefined) runtime.map.setView(points[0], view.zoom, { animate: false });
    else runtime.map.fitBounds(runtime.leaflet.latLngBounds(points), { padding: [44, 56], maxZoom: 14, animate: false });
  }, [runtime, view]);

  return <>
    <div className="el-map-canvas" ref={container} role="region" aria-label={copy.map} dir="ltr" />
    <span className="el-map-center-pin" aria-hidden="true"><FigmaIcon screen={35} name="map-pin" /></span>
    {failed && <p className="el-map-warning" role="status">{copy.mapUnavailable}</p>}
  </>;
}

export function EventMap({ configuration }: { configuration: MapConfiguration }) {
  const navigate = useAppNavigate();
  const { filters, updateFilters } = useEventBrowse();
  const { catalog, loading, error, reload } = useEventCatalog();
  const now = useDeadlineClock(undefined, 60000, catalog?.serverNow);
  const [draft, setDraft] = useState(filters);
  const [selected, setSelected] = useState<string | null>(null);
  const [point, setPoint] = useState<Point | null>(filters.point);
  const [requestedView, setRequestedView] = useState<MapView | null>(null);
  const [locationError, setLocationError] = useState("");
  const [locating, setLocating] = useState(false);
  const locationRequest = useRef(0);
  const resultList = useRef<HTMLDivElement>(null);
  useEffect(() => () => { locationRequest.current++; }, []);
  const cities = useMemo(() => [...new Set(catalog?.events.map(event => event.city))].sort(), [catalog]);
  const cityEvents = useMemo(() => (catalog?.events ?? []).filter(hasCoordinates).filter(event =>
    draft.city === "all" || draft.city === "nearby" || event.city === draft.city), [catalog, draft.city]);
  const initialView = useMemo<MapView>(() => filters.point
    ? { points: [filters.point], zoom: 14 } : { points: cityEvents }, [cityEvents, filters.point]);
  const view = requestedView ?? initialView;
  const events = useMemo(() => filterEvents(catalog?.events ?? [], draft, now ?? 0).filter(hasCoordinates), [catalog, draft, now]);
  const selectedEvent = events.find(event => event.id === selected);
  useEffect(() => { resultList.current?.scrollTo({ left: 0, behavior: "instant" }); }, [selectedEvent?.id]);
  const ordered = selectedEvent ? [selectedEvent, ...events.filter(event => event.id !== selected)] : events;
  const onMove = useCallback((nextPoint: Point) => setPoint(nextPoint), []);

  function chooseCity(city: string) {
    locationRequest.current++;
    setLocating(false); setLocationError(""); setSelected(null);
    setDraft(current => ({ ...current, city, point: null, sort: "soon" }));
    setPoint(null);
    setRequestedView({ points: (catalog?.events ?? []).filter(hasCoordinates).filter(event => city === "all" || event.city === city) });
  }
  function locate() {
    if (!navigator.geolocation) { setLocationError(copy.locationDenied); return; }
    const request = ++locationRequest.current;
    setLocating(true); setLocationError("");
    navigator.geolocation.getCurrentPosition(position => {
      if (request !== locationRequest.current) return;
      const point = { lat: position.coords.latitude, lng: position.coords.longitude };
      setDraft(current => ({ ...current, city: "nearby", sort: "distance", point: { ...point, label: copy.currentLocation } }));
      setPoint(point); setRequestedView({ points: [point], zoom: 14 }); setLocating(false);
    }, () => {
      if (request !== locationRequest.current) return;
      setLocationError(copy.locationDenied); setLocating(false);
    }, { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false });
  }
  function confirmLocation() {
    if (!point) return;
    updateFilters({ ...draft, point: { ...point, label: copy.mapPoint }, city: "nearby", sort: "distance" });
    navigate("/");
  }
  return <main className="el-map-page">
    <Header title={copy.mapHeading} back="/" />
    <p className="el-map-intro">{copy.mapHint}</p>
    <div className="el-map-controls">
      <div className="el-map-search">
        <label className="el-map-city"><span className="el-sr-only">{copy.city}</span><select value={draft.city} onChange={event => chooseCity(event.target.value)}><option value="all">{copy.allCities}</option>{draft.city === "nearby" && <option value="nearby">{copy.nearby}</option>}{cities.map(city => <option key={city} value={city}>{city}</option>)}</select></label>
        <input aria-label={copy.searchLabel} placeholder={copy.mapSearch} value={draft.query} onChange={event => setDraft(current => ({ ...current, query: event.target.value }))} />
        {draft.query && <button className="el-icon-button" aria-label={copy.clearSearch} onClick={() => setDraft(current => ({ ...current, query: "" }))}><FigmaIcon screen={33} name="x" /></button>}
      </div>
      <div className="el-filter-chips" role="group" aria-label={copy.categories}>{categoryCopy.map(category => <button key={category.id} aria-pressed={draft.category === category.id} onClick={() => setDraft(current => ({ ...current, category: category.id }))}>{category.label}</button>)}</div>
    </div>
    <div className="el-map-stage">
      <MapCanvas events={events} configuration={configuration} view={view} selected={selectedEvent?.id ?? null} onSelect={setSelected} onMove={onMove} />
      <p className="el-map-move-hint">{copy.mapMoveHint}</p>
      <button className="el-map-locate" disabled={locating} onClick={locate}><FigmaIcon screen={13} name="current-location" />{locating ? copy.mapLocating : copy.locationShort}</button>
      {locationError && <p className="el-map-warning" role="alert">{locationError}</p>}
    </div>
    <section className="el-map-results" aria-label={copy.mapEvents}>
      <div className="el-map-results-heading"><strong aria-live="polite">{fa(events.length)} {copy.upcomingCount}</strong><button className="el-text-action" disabled={!events.length} onClick={() => setRequestedView({ points: events })}>{copy.mapShowAll}</button></div>
      {loading || now === null ? <LoadingState /> : error ? <ErrorState message={error} retry={reload} /> : !ordered.length ? <div className="el-map-empty"><p>{copy.noMapEvents}</p><button className="el-text-action" onClick={() => { setDraft(defaultCatalogFilters); setSelected(null); setRequestedView({ points: (catalog?.events ?? []).filter(hasCoordinates) }); }}>{copy.mapReset}</button></div> : <div className="el-map-result-list" ref={resultList}>{ordered.map(event => <div key={event.id} className={event.id === selected ? "el-map-selected" : ""}><EventCard event={event} variant="list" /></div>)}</div>}
      <Button disabled={!point || locating} onClick={confirmLocation}>{copy.mapConfirm}</Button>
    </section>
  </main>;
}
