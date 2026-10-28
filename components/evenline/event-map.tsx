"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type * as Leaflet from "leaflet";
import { AppLink, useAppNavigate } from "@/components/event/app-navigation";
import { Home, SlidersHorizontal, ChevronUp, ChevronDown } from "lucide-react";
import { useEventBrowse } from "@/components/event/event-browse-provider";
import { useEventCatalog } from "@/hooks/use-event-catalog";
import { useDeadlineClock } from "@/hooks/use-deadline-clock";
import { defaultCatalogFilters, filterEvents, hasEventCoordinates as hasCoordinates } from "@/lib/event-catalog";
import type { MapConfiguration } from "@/lib/map-configuration";
import { fa, type EventItem } from "@/lib/types";
import { copy, categoryCopy } from "@/locales/fa";
import { FigmaIcon } from "./source-icon";
import { EventCard } from "./event-card";
import { Button, ErrorState, LoadingState } from "./primitives";
import { createMapPoster } from "./map-poster-marker";
import { clusterMapEvents } from "@/lib/map-clusters";
import { MinimalMapCanvas } from "./minimal-map-canvas";
import { VuesaxIcon } from "./vuesax-icon";
import { clampMapPadding, mapDrawerHeights, mapFitPadding } from "@/lib/map-layout";

type Point = { lat: number; lng: number };
type MappedEvent = EventItem & Point & { distance?: number };
type MapView = { points: Point[]; zoom?: number; initial?: boolean; padding?: { top: number; bottom: number; left: number; right: number } };
type MapRuntime = { active: boolean; map: Leaflet.Map; leaflet: typeof Leaflet; markers: Leaflet.LayerGroup };
type DrawerSnap = "collapsed" | "preview" | "expanded";
const drawerSnaps: DrawerSnap[] = ["collapsed", "preview", "expanded"];
const mapCategoryIcons = { all: "flash", halloween: "ghost", music: "music", art: "brush", books: "book", games: "game", coffee: "coffee", uncategorized: "flash" } as const;

function MapCanvas({ events, configuration, view, selected, onSelect, onMove, selectLocation }: {
  events: MappedEvent[];
  configuration: MapConfiguration;
  view: MapView;
  selected: string | null;
  onSelect: (id: string) => void;
  onMove: (point: Point) => void;
  selectLocation: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onSelect, onMove, selectLocation });
  const [runtime, setRuntime] = useState<MapRuntime | null>(null);
  const [failed, setFailed] = useState(false);
  const initialViewApplied = useRef(false);
  useEffect(() => { callbacks.current = { onSelect, onMove, selectLocation }; }, [onSelect, onMove, selectLocation]);
  useEffect(() => {
    let active = true;
    let map: Leaflet.Map | undefined;
    let instance: MapRuntime | undefined;
    let observer: ResizeObserver | undefined;
    void import("@/lib/leaflet-client").then(({ default: L }) => {
      if (!active || !container.current) return;
      map = L.map(container.current, { zoomControl: false, attributionControl: false });
      map.on("click", event => { if (callbacks.current.selectLocation) map?.panTo(event.latlng, { animate: false }); });
      // A neutral world view remains usable when no catalog coordinates are available.
      map.setView([0, 0], 2);
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
      observer = new ResizeObserver(() => { if (active) map?.invalidateSize({ pan: false }); });
      observer.observe(container.current);
      instance = { active: true, map, leaflet: L, markers: L.layerGroup().addTo(map) };
      setRuntime(instance);
    }).catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      if (instance) instance.active = false;
      observer?.disconnect(); map?.remove();
    };
  }, [configuration]);

  useEffect(() => {
    if (!runtime?.active) return;
    const { map, leaflet: L, markers } = runtime;
    const render = () => {
      markers.clearLayers();
      for (const cluster of clusterMapEvents(events, event => map.latLngToContainerPoint([event.lat, event.lng]), 76)) {
        const button = createMapPoster(cluster.items, selected, map.getCenter().wrap());
        const select = () => {
          const event = cluster.items.find(item => item.id === selected) ?? cluster.items[0];
          if (cluster.items.length > 1 && map.getZoom() < 17) {
            map.setView([cluster.lat, cluster.lng], Math.min(17, map.getZoom() + 3), { animate: false });
          } else map.setView([event.lat, event.lng], Math.max(14, map.getZoom()), { animate: false });
          callbacks.current.onSelect(event.id);
        };
        button.addEventListener("click", event => { event.stopPropagation(); select(); });
        L.marker([cluster.lat, cluster.lng], {
          keyboard: false, bubblingMouseEvents: false,
          icon: L.divIcon({ html: button, className: "el-map-poster-host", iconSize: [104, 44], iconAnchor: [52, 22] }),
          zIndexOffset: cluster.items.some(event => event.id === selected) ? 1000 : 0,
        }).addTo(markers);
      }
    };
    render(); map.on("moveend", render);
    return () => { map.off("moveend", render); markers.clearLayers(); };
  }, [runtime, events, selected]);

  useEffect(() => {
    if (!runtime?.active || !view.points.length) return;
    if (view.initial && initialViewApplied.current) return;
    initialViewApplied.current = true;
    const points = view.points.map(point => [point.lat, point.lng] as [number, number]);
    if (view.zoom !== undefined) runtime.map.setView(points[0], view.zoom, { animate: false });
    else {
      const size = runtime.map.getSize();
      const style = getComputedStyle(container.current!);
      const padding = view.padding ? clampMapPadding(size.x, size.y, view.padding)
        : mapFitPadding(size.x, size.y, callbacks.current.selectLocation,
          parseFloat(style.getPropertyValue("--map-safe-top")) || 0,
          parseFloat(style.getPropertyValue("--map-safe-bottom")) || 0);
      runtime.map.fitBounds(runtime.leaflet.latLngBounds(points), { paddingTopLeft: [padding.left, padding.top], paddingBottomRight: [padding.right, padding.bottom], maxZoom: 14, animate: false });
    }
  }, [runtime, view]);

  return <>
    <div className="el-map-canvas" ref={container} role="region" aria-label={copy.map} aria-describedby={selectLocation ? "map-location-hint" : undefined} dir="ltr" />

    {failed && <p className="el-map-warning" role="status">{copy.mapUnavailable}</p>}
  </>;
}

export function EventMap({ configuration, introductory = false, homeHref = "/" }: {
  configuration: MapConfiguration;
  introductory?: boolean;
  homeHref?: "/" | "/?layout=v2";
}) {
  const navigate = useAppNavigate();
  const { filters, updateFilters, completeMapIntroduction } = useEventBrowse();
  const { catalog, loading, error, reload } = useEventCatalog();
  const now = useDeadlineClock(undefined, 60000, catalog?.serverNow);
  const [draft, setDraft] = useState(filters);
  const [selectLocation, setSelectLocation] = useState(introductory);
  const [selected, setSelected] = useState<string | null>(null);
  const [point, setPoint] = useState<Point | null>(filters.point);
  const [requestedView, setRequestedView] = useState<MapView | null>(null);
  const [locationError, setLocationError] = useState("");
  const [locating, setLocating] = useState(false);
  const [drawerSnap, setDrawerSnap] = useState<DrawerSnap>(introductory ? "collapsed" : "preview");
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const page = useRef<HTMLElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState<{ height: number; safeTop: number; safeBottom: number } | null>(null);
  const dragStart = useRef<{ pointer: number; y: number; height: number; lastY: number; time: number; velocity: number } | null>(null);
  const dragged = useRef(false);
  const locationRequest = useRef(0);
  const resultList = useRef<HTMLDivElement>(null);
  useEffect(() => () => { locationRequest.current++; }, []);
  useEffect(() => {
    const element = page.current;
    if (!element) return;
    let active = true;
    const observer = new ResizeObserver(([entry]) => {
      if (!active) return;
      const style = getComputedStyle(element);
      setViewport({ height: entry.contentRect.height,
        safeTop: parseFloat(style.getPropertyValue("--map-safe-top")) || 0,
        safeBottom: parseFloat(style.getPropertyValue("--map-safe-bottom")) || 0 });
    });
    observer.observe(element);
    return () => { active = false; observer.disconnect(); };
  }, []);
  const cities = useMemo(() => [...new Set(catalog?.events.map(event => event.city))].sort(), [catalog]);
  const cityEvents = useMemo(() => (catalog?.events ?? []).filter(hasCoordinates).filter(event =>
    draft.city === "all" || draft.city === "nearby" || event.city === draft.city), [catalog, draft.city]);
  const initialView = useMemo<MapView>(() => filters.point
    ? { points: [filters.point], zoom: 14, initial: true } : { points: cityEvents, initial: true }, [cityEvents, filters.point]);
  // A viewport resize must not replay a previously requested camera movement.
  const view = requestedView ?? initialView;
  // Keep all matching markers visible; distance ranking must not move the map or hide pins.
  const events = useMemo(() => filterEvents(catalog?.events ?? [], { ...draft, city: draft.city === "nearby" ? "all" : draft.city, point: null }, now ?? 0).filter(hasCoordinates), [catalog, draft, now]);
  const nearbyEvents = useMemo(() => filterEvents(events, { ...defaultCatalogFilters, point: point ? { ...point, label: copy.mapPoint } : null, sort: "distance" }, now ?? 0), [events, point, now]);
  const selectedEvent = nearbyEvents.find(event => event.id === selected);
  useEffect(() => { resultList.current?.scrollTo({ top: 0, behavior: "instant" }); }, [selectedEvent?.id]);
  const ordered = selectedEvent ? [selectedEvent, ...nearbyEvents.filter(event => event.id !== selected)] : nearbyEvents;
  const onMove = useCallback((nextPoint: Point) => {
    setPoint(nextPoint);
    if (!selectLocation) return;
    setSelected(current => {
      const event = events.find(event => event.id === current);
      return event && Math.abs(event.lat - nextPoint.lat) < 0.00001 && Math.abs(event.lng - nextPoint.lng) < 0.00001 ? current : null;
    });
  }, [events, selectLocation]);

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
      setDraft(current => ({ ...current, city: "all", sort: "distance", point: { ...point, label: copy.currentLocation } }));
      setPoint(point); setRequestedView({ points: [point], zoom: 14 }); setLocating(false);
    }, () => {
      if (request !== locationRequest.current) return;
      setLocationError(copy.locationDenied); setLocating(false);
    }, { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false });
  }
  function confirmLocation() {
    if (!point) return;
    updateFilters({ ...draft, point: { ...point, label: copy.mapPoint }, city: "all", sort: "distance" });
    completeMapIntroduction();
    navigate(homeHref, { replace: introductory });
  }
  function skipLocation() {
    locationRequest.current++;
    completeMapIntroduction();
    navigate(homeHref, { replace: true });
  }
  function openFilters() {
    updateFilters({ ...draft, point: point ? { ...point, label: copy.mapPoint } : null });
    navigate(`/filters?from=map${introductory ? "&intro=1" : ""}${homeHref.includes("layout=v2") ? "&layout=v2" : ""}`);
  }
  function selectEvent(id: string) { setSelected(id); setDrawerSnap("preview"); }
  function snapHeights() {
    const height = page.current?.clientHeight ?? window.innerHeight;
    const style = getComputedStyle(page.current!);
    return mapDrawerHeights(height, selectLocation,
      parseFloat(style.getPropertyValue("--map-safe-top")) || 0,
      parseFloat(style.getPropertyValue("--map-safe-bottom")) || 0);
  }
  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    const height = drawer.current!.getBoundingClientRect().height;
    dragStart.current = { pointer: event.pointerId, y: event.clientY, height, lastY: event.clientY, time: event.timeStamp, velocity: 0 };
    dragged.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragHeight(height);
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragStart.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    if (Math.abs(event.clientY - drag.y) > 4) dragged.current = true;
    drag.velocity = (drag.lastY - event.clientY) / Math.max(1, event.timeStamp - drag.time);
    drag.lastY = event.clientY; drag.time = event.timeStamp;
    const heights = snapHeights();
    setDragHeight(Math.max(heights.collapsed, Math.min(heights.expanded, drag.height + drag.y - event.clientY)));
  }
  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragStart.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    if (dragged.current) {
      const heights = snapHeights();
      const height = Math.max(heights.collapsed, Math.min(heights.expanded, drag.height + drag.y - event.clientY));
      const velocity = event.timeStamp - drag.time < 100 ? drag.velocity : 0;
      const projected = height + velocity * 160;
      setDrawerSnap(drawerSnaps.reduce((nearest, snap) => Math.abs(heights[snap] - projected) < Math.abs(heights[nearest] - projected) ? snap : nearest, "collapsed"));
    }
    dragStart.current = null; setDragHeight(null);
  }
  const drawerOpen = drawerSnap !== "collapsed" || dragHeight !== null;
  const heights = viewport ? mapDrawerHeights(viewport.height, selectLocation, viewport.safeTop, viewport.safeBottom) : null;
  const panelStyle = {
    ...(heights ? { "--map-collapsed-height": `${heights.collapsed}px`, "--map-preview-height": `${heights.preview}px`, "--map-expanded-height": `${heights.expanded}px` } : {}),
    ...(dragHeight !== null ? { "--map-panel-height": `${dragHeight}px` } : {}),
  } as CSSProperties;
  return <main ref={page} className={`el-map-page el-map-fullscreen${dragHeight !== null ? " is-dragging" : ""}`} data-drawer={drawerSnap} data-select-location={selectLocation}
    style={panelStyle}>
    <header className="el-map-floating-header">
      <h1 className="el-sr-only">{selectLocation ? copy.mapHeading : copy.mapBrowseHeading}</h1>
      <div className="el-map-toolbar">
        <AppLink className="el-icon-button el-map-home" href={homeHref} aria-label={copy.home} onNavigate={introductory ? event => { event.preventDefault(); skipLocation(); } : undefined}><Home size={20} aria-hidden="true" /></AppLink>
        <div className="el-map-search">
          <label className="el-map-city"><VuesaxIcon name="location" /><span className="el-sr-only">{copy.city}</span><select aria-label={copy.city} value={draft.city} onChange={event => chooseCity(event.target.value)}><option value="all">{copy.allCities}</option>{draft.city === "nearby" && <option value="nearby">{copy.nearby}</option>}{cities.map(city => <option key={city} value={city}>{city}</option>)}</select></label>
          <input aria-label={copy.searchLabel} placeholder={copy.searchLabel} value={draft.query} onChange={event => setDraft(current => ({ ...current, query: event.target.value }))} />
          {draft.query ? <button className="el-icon-button" aria-label={copy.clearSearch} onClick={() => setDraft(current => ({ ...current, query: "" }))}><FigmaIcon screen={33} name="x" /></button> : <VuesaxIcon name="search-normal" />}
        </div>
        <button className="el-icon-button el-map-filter" onClick={openFilters} aria-label={copy.filters}><SlidersHorizontal size={20} aria-hidden="true" /></button>
      </div>
      <div className="el-filter-chips el-map-category-chips" role="group" aria-label={copy.categories}>{categoryCopy.map(category => <button key={category.id} aria-pressed={draft.category === category.id} onClick={() => setDraft(current => ({ ...current, category: category.id }))}><VuesaxIcon name={mapCategoryIcons[category.id]} />{category.id === "all" ? copy.allResults : category.label}</button>)}</div>
    </header>
    <div className="el-map-stage">
      {configuration.styleUrl ? <MinimalMapCanvas events={events} configuration={configuration} view={view} selected={selectedEvent?.id ?? null} onSelect={selectEvent} onMove={onMove} selectLocation={selectLocation} /> : <MapCanvas events={events} configuration={configuration} view={view} selected={selectedEvent?.id ?? null} onSelect={selectEvent} onMove={onMove} selectLocation={selectLocation} />}
      {selectLocation && <span className="el-map-center-pin" aria-hidden="true"><span className="el-map-center-core" /></span>}
      <button className="el-map-locate" disabled={locating} aria-label={locating ? copy.mapLocating : copy.locationShort} aria-busy={locating} title={copy.locationShort} onClick={locate}><FigmaIcon screen={13} name="current-location" /></button>
      {!selectLocation && <button className="el-map-mode" onClick={() => { setSelectLocation(true); setDrawerSnap("collapsed"); }}><VuesaxIcon name="location" />{copy.mapChooseLocation}</button>}
      {locationError && <p className="el-map-warning" role="alert">{locationError}</p>}
    </div>
    <section ref={drawer} className="el-map-drawer" aria-label={copy.mapEvents}>
      <button className="el-map-drawer-handle" aria-label={drawerOpen ? copy.mapCollapseEvents : copy.mapExpandEvents} aria-expanded={drawerOpen} aria-controls="map-drawer-content"
        onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag}
        onPointerCancel={() => { dragStart.current = null; dragged.current = true; setDragHeight(null); }}
        onLostPointerCapture={() => { dragStart.current = null; setDragHeight(null); }}
        onClick={() => { if (!dragged.current) setDrawerSnap(current => current === "collapsed" ? "preview" : "collapsed"); dragged.current = false; }}
        onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Escape") { event.preventDefault(); setDrawerSnap(current => event.key === "Escape" ? "collapsed" : drawerSnaps[Math.max(0, Math.min(2, drawerSnaps.indexOf(current) + (event.key === "ArrowUp" ? 1 : -1)))]); } }}><span aria-hidden="true" />{drawerOpen ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronUp size={18} aria-hidden="true" />}</button>
      <div className="el-map-drawer-content" id="map-drawer-content" hidden={!drawerOpen} ref={resultList}>
      <div className="el-map-results">
      <div className="el-map-results-heading"><h2>{copy.mapNearbyEvents} <span aria-live="polite">({fa(events.length)})</span></h2><button className="el-text-action" disabled={!events.length} onClick={() => { setRequestedView({ points: events }); setDrawerSnap("preview"); }}>{copy.mapShowAll}</button></div>
      {loading || now === null ? <LoadingState /> : error ? <ErrorState message={error} retry={reload} /> : !ordered.length ? <div className="el-map-empty"><p>{copy.noMapEvents}</p><button className="el-text-action" onClick={() => { setDraft(defaultCatalogFilters); setSelected(null); setRequestedView({ points: (catalog?.events ?? []).filter(hasCoordinates) }); }}>{copy.mapReset}</button></div> : <div className="el-map-result-list">{ordered.map(event => <div key={event.id} className={event.id === selected ? "el-map-selected" : ""}><EventCard event={event} variant="list" /></div>)}</div>}
      </div></div>
      {selectLocation && <div className="el-map-location-selection"><p className="el-map-intro" id="map-location-hint">{copy.mapHint}</p><div className="el-map-drawer-actions">
      <Button disabled={!point || locating} onClick={confirmLocation}>{copy.mapConfirmLocation}</Button>
      {!introductory && <button className="el-text-action" onClick={() => { setSelectLocation(false); setDrawerSnap("preview"); }}>{copy.mapBrowseMode}</button>}
      {introductory && <button className="el-text-action" onClick={skipLocation}>{copy.skip}</button>}
      </div></div>}
    </section>
  </main>;
}
