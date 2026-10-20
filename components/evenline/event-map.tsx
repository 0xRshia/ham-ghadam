"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { useAppNavigate } from "@/components/event/app-navigation";
import { useEventBrowse } from "@/components/event/event-browse-provider";
import { useEventCatalog } from "@/hooks/use-event-catalog";
import { useDeadlineClock } from "@/hooks/use-deadline-clock";
import { defaultCatalogFilters, filterEvents, hasEventCoordinates as hasCoordinates } from "@/lib/event-catalog";
import type { MapConfiguration } from "@/lib/map-configuration";
import { fa, type EventItem } from "@/lib/types";
import { copy, categoryCopy } from "@/locales/fa";
import { FigmaIcon } from "./source-icon";
import { EventCard } from "./event-card";
import { Button, Header, ErrorState, LoadingState } from "./primitives";
import { createMapPoster } from "./map-poster-marker";
import { clusterMapEvents } from "@/lib/map-clusters";
import { MinimalMapCanvas } from "./minimal-map-canvas";

type Point = { lat: number; lng: number };
type MappedEvent = EventItem & Point & { distance?: number };
type MapView = { points: Point[]; zoom?: number; initial?: boolean };
type MapRuntime = { active: boolean; map: Leaflet.Map; leaflet: typeof Leaflet; markers: Leaflet.LayerGroup };

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
    void import("leaflet").then(L => {
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
      observer = new ResizeObserver(() => map?.invalidateSize({ pan: false }));
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
        const button = createMapPoster(cluster.items, selected);
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
          icon: L.divIcon({ html: button, className: "el-map-poster-host", iconSize: [48, 64], iconAnchor: [24, 32] }),
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
    else runtime.map.fitBounds(runtime.leaflet.latLngBounds(points), { paddingTopLeft: [56, 80], paddingBottomRight: [56, 112], maxZoom: 14, animate: false });
  }, [runtime, view]);

  return <>
    <div className="el-map-canvas" ref={container} role="region" aria-label={copy.map} dir="ltr" />

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
  const locationRequest = useRef(0);
  const resultList = useRef<HTMLDivElement>(null);
  useEffect(() => () => { locationRequest.current++; }, []);
  const cities = useMemo(() => [...new Set(catalog?.events.map(event => event.city))].sort(), [catalog]);
  const cityEvents = useMemo(() => (catalog?.events ?? []).filter(hasCoordinates).filter(event =>
    draft.city === "all" || draft.city === "nearby" || event.city === draft.city), [catalog, draft.city]);
  const initialView = useMemo<MapView>(() => filters.point
    ? { points: [filters.point], zoom: 14, initial: true } : { points: cityEvents, initial: true }, [cityEvents, filters.point]);
  const view = requestedView ?? initialView;
  // Keep all matching markers visible; distance ranking must not move the map or hide pins.
  const events = useMemo(() => filterEvents(catalog?.events ?? [], { ...draft, city: draft.city === "nearby" ? "all" : draft.city, point: null }, now ?? 0).filter(hasCoordinates), [catalog, draft, now]);
  const nearbyEvents = useMemo(() => filterEvents(events, { ...defaultCatalogFilters, point: point ? { ...point, label: copy.mapPoint } : null, sort: "distance" }, now ?? 0), [events, point, now]);
  const selectedEvent = nearbyEvents.find(event => event.id === selected);
  useEffect(() => { resultList.current?.scrollTo({ left: 0, behavior: "instant" }); }, [selectedEvent?.id]);
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
  return <main className="el-map-page">
    <Header title={selectLocation ? copy.mapHeading : copy.mapBrowseHeading} back={homeHref} onBack={introductory ? skipLocation : undefined} />
    <p className="el-map-intro">{selectLocation ? copy.mapHint : copy.mapBrowseHint}</p>
    <div className="el-map-controls">
      <div className="el-map-search">
        <label className="el-map-city"><span className="el-sr-only">{copy.city}</span><select value={draft.city} onChange={event => chooseCity(event.target.value)}><option value="all">{copy.allCities}</option>{draft.city === "nearby" && <option value="nearby">{copy.nearby}</option>}{cities.map(city => <option key={city} value={city}>{city}</option>)}</select></label>
        <input aria-label={copy.searchLabel} placeholder={copy.mapSearch} value={draft.query} onChange={event => setDraft(current => ({ ...current, query: event.target.value }))} />
        {draft.query && <button className="el-icon-button" aria-label={copy.clearSearch} onClick={() => setDraft(current => ({ ...current, query: "" }))}><FigmaIcon screen={33} name="x" /></button>}
      </div>
      <div className="el-filter-chips" role="group" aria-label={copy.categories}>{categoryCopy.map(category => <button key={category.id} aria-pressed={draft.category === category.id} onClick={() => setDraft(current => ({ ...current, category: category.id }))}>{category.label}</button>)}</div>
    </div>
    <div className="el-map-stage">
      {configuration.styleUrl ? <MinimalMapCanvas events={events} configuration={configuration} view={view} selected={selectedEvent?.id ?? null} onSelect={setSelected} onMove={onMove} selectLocation={selectLocation} /> : <MapCanvas events={events} configuration={configuration} view={view} selected={selectedEvent?.id ?? null} onSelect={setSelected} onMove={onMove} selectLocation={selectLocation} />}
      {selectLocation && <><span className="el-map-center-pin" aria-hidden="true"><span className="el-map-center-core" /></span><p className="el-map-move-hint">{copy.mapMoveHint}</p></>}
      {!introductory && <button className="el-map-mode" aria-pressed={selectLocation} onClick={() => setSelectLocation(current => !current)}><FigmaIcon screen={35} name="map-pin" />{selectLocation ? copy.mapBrowseMode : copy.mapChooseLocation}</button>}
      <button className="el-map-locate" disabled={locating} aria-label={locating ? copy.mapLocating : copy.locationShort} aria-busy={locating} title={copy.locationShort} onClick={locate}><FigmaIcon screen={13} name="current-location" /></button>
      {locationError && <p className="el-map-warning" role="alert">{locationError}</p>}
    </div>
    <section className="el-map-results" aria-label={copy.mapEvents}>
      <div className="el-map-results-heading"><strong aria-live="polite">{fa(events.length)} {copy.upcomingCount}</strong><button className="el-text-action" disabled={!events.length} onClick={() => setRequestedView({ points: events })}>{copy.mapShowAll}</button></div>
      {loading || now === null ? <LoadingState /> : error ? <ErrorState message={error} retry={reload} /> : !ordered.length ? <div className="el-map-empty"><p>{copy.noMapEvents}</p><button className="el-text-action" onClick={() => { setDraft(defaultCatalogFilters); setSelected(null); setRequestedView({ points: (catalog?.events ?? []).filter(hasCoordinates) }); }}>{copy.mapReset}</button></div> : <div className="el-map-result-list" ref={resultList}>{ordered.map(event => <div key={event.id} className={event.id === selected ? "el-map-selected" : ""}><EventCard event={event} variant="list" /></div>)}</div>}
      {selectLocation && <Button disabled={!point || locating} onClick={confirmLocation}>{copy.mapConfirm}</Button>}
      {introductory && <Button variant="secondary" onClick={skipLocation}>{copy.skip}</Button>}
    </section>
  </main>;
}
