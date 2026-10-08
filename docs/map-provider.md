# Map provider

The map uses Leaflet 1.9.4 only for geographic rendering and interaction. Event positions come from the existing catalog. Location permission is requested only by an explicit button; coordinates remain in the mounted browsing context and are not written to the user's profile.

The first home visit in a browser replaces the route with `/map?intro=1`, preserving `layout=v2` when selected. Skip, introductory Back, and confirmation save only `hg_map_introduction_completed=1` in local storage. Storage failure retains completion in memory. Direct event, account, and booking routes are not intercepted. Coordinates and filters reset on a full reload, but the completed introduction does not repeat.

The main-page search also opens the location picker manually. The initial viewport is Tehran (35.6892, 51.3890), zoom 11, or the currently selected point. This is a viewing default, never an inferred event location. Catalog loading does not reset the viewport. City, search, and category changes remain a draft until confirmation. Dragging or tapping the map selects its center; the location button centers it on the browser's coordinates. Skip and Back discard draft changes. Cities and event markers come from published catalog records. Marker selection works with clicks, Enter, and Space and brings that event to the beginning of the map results without reinitializing the map.

Confirmation applies the point and draft non-location filters with `city=all` and `sort=distance`. It sorts events without imposing a city boundary or the legacy 50 km nearby filter. Missing coordinates sort last, with start time and ID breaking distance ties. Home sections and their preview limits remain; their candidates, including eligible recommendations, are ordered by distance before limiting. Search results retain that order. With no selected point, the existing date, popularity, and recommendation ordering remains.

The default provider is OpenStreetMap Standard. Its attribution is always visible. Browser tile requests keep their normal Referer and HTTP cache behavior; no tile proxy, offline download, bulk prefetch, or service-worker tile cache is implemented. Tile delivery is best-effort and failures leave the actual event list accessible.

Change the provider at runtime with all three environment variables:

- `MAP_TILE_URL`: HTTPS tile template containing `{z}`, `{x}`, `{y}`. Use only a public browser tile token if the provider requires one; this URL is delivered to clients.
- `MAP_ATTRIBUTION_LABEL`: provider-required attribution text.
- `MAP_ATTRIBUTION_URL`: HTTPS copyright/attribution page.

Automated tests must intercept tile traffic, not pan/zoom a headless browser against community servers. See the [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/), [Leaflet 1.9 reference](https://leafletjs.com/reference-1.9.4.html), and [Figma paint documentation](https://developers.figma.com/docs/plugins/api/Paint/) for source gradient semantics.

## Learning notes

A source map screenshot encodes a fixed location. Reusing it as the live map would misrepresent event positions. Geographic rendering is isolated in `components/evenline/event-map.tsx`; provider configuration is isolated in `lib/map-configuration.ts`. Introduction completion is separate from coordinate state so dismissing the prompt does not persist a person's selected location.

## Why this matters

The visual shell follows the source while the information remains truthful. Operators can replace the tile service without changing UI components, and unavailable tiles do not remove access to bookings or event details.

City thumbnails and event-detail maps use the same provider. City centers are calculated only from stored event coordinates; no city coordinates are invented. Each noninteractive preview initializes when it enters the viewport, with no tile buffer or interaction/prefetch. City-list attribution appears immediately below the list, outside the selection buttons; event-detail attribution appears below the map. If no coordinates exist, the existing textual venue/location action remains available. Preview requests use the ordinary browser cache and are intercepted during automated checks.

The source gradient layers are hidden in both map variants and are not rendered. The default tile provider has a light map style in both themes. A dark surface behind the venue label preserves contrast without recoloring the map; this is an accessibility/provider deviation from the source dark basemap.
