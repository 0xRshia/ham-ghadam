type RtlSdk = Pick<typeof import("maplibre-gl"), "getRTLTextPluginStatus" | "setRTLTextPlugin">;
export const MAP_RTL_PLUGIN_URL = "/vendor/map-rtl/mapbox-gl-rtl-text-0.3.0.js";
let ready: Promise<void> | undefined;

export function ensureMapRtl(sdk: RtlSdk): Promise<void> {
  if (sdk.getRTLTextPluginStatus() === "loaded") return Promise.resolve();
  // The plugin is global to MapLibre: map and preview instances must share one load.
  ready ??= sdk.setRTLTextPlugin(MAP_RTL_PLUGIN_URL, false);
  return ready;
}
