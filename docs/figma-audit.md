# Evenline → هم‌قدم source audit

Source: https://www.figma.com/design/OZYMSmM5TdvwqElb2rEN95?node-id=0-1
Audited 2026-09-30 using Figma MCP and the user-supplied local export. Target repository was empty; existing implementation is `/Users/admin/repo/mvp`.

## Access and completeness

Actual metadata, component sets, paint/text styles, layout properties, effects and prototype reactions were inspected. 52 numbered screens per theme, 36 component sets and 207 variants. Full page hierarchy is retained in `figma/source/screens.xml`. Eight high-fidelity contexts were captured before the Starter-plan MCP quota was exhausted: light/dark Home V1, detail, filters, ticket selection, upcoming tickets, empty favorites, settings. The user subsequently supplied the complete screen PNG/SVG ZIP and local `.fig` file. The latter was decoded into 8,556 nodes, including inherited styles, component overrides, derived geometry, effects, image hashes, and 2,322 path/font blobs. `figma/source/local-document.json` preserves the metadata for all screens and themes. The archive contains 85 embedded image files. The source-access blocker is resolved; implementation and visual evidence are recorded in `visual-qa.md`. Some component sets contain Figma definition errors; variant names remain readable. No local variables, named effect styles or prototype reactions were returned. Numbered screens imply sequence, but no wired prototype was available.

## Foundations

| Paint style | Display hex |
| --- | --- |
| Primary / 100 | #FFF2EC |
| Primary / 200 | #FFD5C0 |
| Primary / 300 | #FFB895 |
| Primary / 400 | #FF9C6A |
| Primary/Base | #FF8142 |
| Secondary/100 | #F5FBFF |
| Secondary / 200 | #BAE7FF |
| Secondary / 300 | #57AAD6 |
| Secondary / 400 | #1E6A92 |
| Alerts / Error / Light | #FF7171 |
| Alerts / Error / Base | #FF4747 |
| Alerts / Error / Dark | #DD3333 |
| Alerts / Warning / Light | #FDE047 |
| Alerts / Warning / Base | #FACC15 |
| Alerts / Warning / Dark | #EAB308 |
| Alerts / Success / Light | #4ADE80 |
| Alerts / Success / Base | #22C55E |
| Alerts / Success / Dark | #16A34A |
| Others / Amber | #FCD34D |
| Others / Sky | #38BDF8 |
| Others / Teal | #2DD4BF |
| Others/Blue | #3B82F6 |
| Others / White | #FFFFFF |
| Others / Camaron | #FF8092 |
| Others / Portage | #887EF9 |
| Greyscale / 900 | #111827 |
| Greyscale/800 | #1F2937 |
| Greyscale/700 | #374151 |
| Greyscale/600 | #4B5563 |
| Greyscale/500 | #6B7280 |
| Greyscale / 400 | #9CA3AF |
| Greyscale / 300 | #D1D5DB |
| Greyscale / 200 | #E5E7EB |
| Greyscale / 100 | #F3F4F6 |
| Greyscale / 50 | #F9FAFB |
| Secondary / Base | #00334E |

Exact floating-point colors are retained in `figma/source/styles.json`; rounded HEX values above are for inspection. Theme roles from Home V1: light background/surface white, inset #F9FAFB, heading #111827, muted #9CA3AF, price background #FFF2EC. Dark background #111827, surface/inset #1F2937, heading #F9FAFB, muted #9CA3AF, price background #374151. Primary #FF8142 in both.

| Text style | Source font | Size | Line height | Tracking |
| --- | --- | --- | --- | --- |
| Heading / H1 | Noto Sans JP Bold | 48 | {'unit': 'PERCENT', 'value': 120.00000476837158} | {'unit': 'PIXELS', 'value': -1.5} |
| Heading / H2 | Noto Sans JP Bold | 40 | {'unit': 'PERCENT', 'value': 120.00000476837158} | {'unit': 'PIXELS', 'value': -1} |
| body/xlarge/light | Noto Sans JP DemiLight | 18 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0} |
| body/xlarge/regular | Noto Sans JP Regular | 18 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0} |
| body/xlarge/medium | Noto Sans JP Medium | 18 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0} |
| body/large/light | Noto Sans JP DemiLight | 16 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0} |
| body/large/regular | Noto Sans JP Regular | 16 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0.4000000059604645} |
| body/large/medium | Noto Sans JP Medium | 16 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0.30000001192092896} |
| body/medium/light | Noto Sans JP DemiLight | 14 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0} |
| body/medium/regular | Noto Sans JP Regular | 14 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0} |
| body/medium/medium | Noto Sans JP Medium | 14 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0} |
| body/small/light | Noto Sans JP DemiLight | 12 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0} |
| body/small/regular | Noto Sans JP Regular | 12 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0} |
| body/small/medium | Noto Sans JP Medium | 12 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0} |
| body/xsmall/light | Noto Sans JP DemiLight | 10 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0} |
| body/xsmall/regular | Noto Sans JP Regular | 10 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0} |
| body/xsmall/medium | Noto Sans JP Medium | 10 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0} |
| body/xsmall/bold | Noto Sans JP Bold | 10 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0} |
| body/small/bold | Noto Sans JP Bold | 12 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0} |
| body/medium/bold | Noto Sans JP Bold | 14 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0} |
| body/large/bold | Noto Sans JP Bold | 16 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0} |
| body/xlarge/bold | Noto Sans JP Bold | 18 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0} |
| Heading/H3 | Noto Sans JP Bold | 32 | {'unit': 'PERCENT', 'value': 139.9999976158142} | {'unit': 'PIXELS', 'value': -0.5} |
| Heading/H4 | Noto Sans JP Bold | 24 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': -0.20000000298023224} |
| Heading/H5 | Noto Sans JP Bold | 20 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0} |
| Heading / H6 | Noto Sans JP Bold | 18 | {'unit': 'PERCENT', 'value': 150} | {'unit': 'PIXELS', 'value': 0} |

## Geometry and effects

375 × 812 reference. Four columns, 20px grid gutters, 24px outer gutters; content 327px. Status inset 44px, gesture area 34px. Production omits simulated device chrome and uses actual safe-area insets. App header 56px (home 72px); bottom navigation content 64px, 24px gaps, 20px inline padding. Inputs/search/primary buttons 56px high, radius 16px. Inputs use 20px padding; search uses 16px. Card body 272 × 270; image 248 × 140, inset 12px, radius 12px. Event list body 327 × 120, image 88 × 96. Light card blur extends the component bounds by 4px; dark cards have no blur. All raw spacing/radius/effect counts retained in measurements.json. Repeated content gaps include 4, 8, 12, 16, 24; special 10/18/20px values must be retained where used. Footer actions 56px, profile/settings rows 80px. Do not reinterpret fixed alignment gaps as a global spacing scale.

## Reuse and implementation plan

1. Retain the existing React/TypeScript, Next App Router/vinext, npm lockfile, API handlers, SQLite adapter, validation and Persian font assets.
2. Add exact primitive tokens and semantic light/dark roles; Figma source SVG assets; central Persian content.
3. Implement shared native RTL navigation, headers, event cards, date badges, buttons, input/filter controls and templates from available contexts.
4. Connect source-backed screens to existing event, account and reservation contracts; preserve availability and payment validation.
5. Validate reference geometry in both themes, adjacent widths, overflow and functional flow. Keep unavailable screens explicitly pending.

## Product adaptation decisions

Use هم‌قدم identity, existing event content, IRANSansX fonts, Iranian phone verification, toman amounts and Asia/Tehran Jalali dates. Dynamic event photographs stay API-supplied. The user explicitly authorized adding the missing backend models and flows; implemented additions include password credentials/recovery, organizer and collection follows, profiles, collections, account favorites, stored notifications, ticket tiers and reservation-item snapshots. Google and Apple sign-in are explicitly excluded by the user's later instruction. No provider endpoints or successful payment/SMS responses are fabricated. Guest favorites stay local; authenticated favorites are stored by account. Existing sample records are used only in explicit local QA/demo mode and retain sample status.

The source OTP layout has four digits; Hmghadam retains six-digit SMS verification, with six equal cells preserving source height, gaps and radius. The original 44px simulated status bar and 34px gesture indicator are omitted in browser rendering. Collection editing is a necessary additional functional surface: it reuses source inputs, lists and sheet primitives because the kit has no collection editor frame. Ticket history replaces the source's seat field with the actual event date because the existing venue model does not assign seats; no seat number is fabricated.

## Learning Notes / Why This Matters

Source component bounding boxes include blur layers: the light event card measures 276 × 274 while its visible body is 272 × 270. Treating the full bounds as body geometry would shift every carousel. Preserve visible geometry and implement blur as a separate noninteractive layer.

## Offline extraction

The isolated Kiwi decoder reads the two compressed chunks from `canvas.fig`. `scripts/figma/export-assets.py` exports native vector paths (including computed stroke outlines and instance overrides), preserving source dimensions, transforms, colors, opacity, and drop shadows. It refuses unsupported paint/effect/mask combinations instead of approximating them. 121 standalone assets, including all six light/dark empty/success illustrations and the four verification/recovery illustrations, and resolved small-icon variants across all 104 screens were exported. Unsupported flags already have exact SVG exports in the supplied ZIP. Metadata is reference-only and is not loaded into the UI.

### Onboarding and discovery extraction

The six onboarding decorative collages are exported losslessly from the user-supplied 2× screen PNGs using bounds from the editable `.fig` nodes (`scripts/figma/export-onboarding-art.mjs`). This is limited to photographic illustration layers, whose Figma image filters are unsupported by the offline vector exporter. All headings, fields, labels and controls remain live DOM. The Hmghadam logo replaces the source brand inside the get-started illustration. This is an explicit decorative asset export, not a rasterized screen implementation.

Category decorations come from the editable vector geometry of `1444:11141`, `1444:11139`, and `1444:11149`. Their 327×160 masks and gradient stops/transforms are retained. RTL exports reposition each decorative group's bounding box across the composition without reflecting any path, keeping the source illustration orientation while leaving space for RTL text. The three source variants are reused across the five existing Hmghadam categories; counts are calculated from actual upcoming events. Source metadata remains authoritative for the 160px card, 16px padding/radius, 24px title and 32px count chip.

Search (608:53) uses the source's 40px result-kind chips, 12px gaps and 24px section spacing. Events, public collections and organizers are live query results; no source example content is presented as real data. The initial source's featured search result becomes up to three matching/popular actual events. Discovery currently reads the existing catalog and up to 100 public collections/organizers.

Map (608:57) retains the search/chip composition, 40px markers, and 307px bottom results sheet after excluding device chrome. Its static source image is replaced by actual geographical tiles and stored event coordinates. Leaflet supplies pan/zoom behavior; app controls use source assets/tokens. Visible provider attribution and an explicit location action are functional additions. Provider geography and cartography are a documented difference from the source's static map; no palette inversion is applied to the map in dark mode.

### Notification settings and delivery

Screen 50 uses the editable 1203:488 / 1442:6037 geometry: 327×80 rows at 24px gutters, 8px gaps, 48×48 icon containers with 12px radii, 44×24 source toggles, 12px bold titles and 10px regular descriptions with 1.5 line height. All seven controls correspond to actual browser/email preferences. Light icon containers use Greyscale 50 and dark containers Greyscale 800; icon paths are extracted source assets. Unconfigured-provider descriptions and email verification are functional extensions necessary for genuine delivery, not successful placeholder interactions. The additional verification page reuses the source-derived OTP/input/button primitives. See `docs/notifications.md` for delivery setup and privacy behavior.

### Profile editing and uploaded images

Screen 45 now follows 608:74 / 1442:6317: the 100×100 circular avatar begins at content y=88 (device status area excluded), the first field begins at y=228, and the 327×56 save button begins at y=670. The camera uses its extracted 14px source asset and 88×29 overlay. Filled controls use 20px horizontal padding, 20px source icons, 12px gaps and the 56px source height. A configured password is represented by the source's seven 8px circles with 6px gaps; an account without a password says so instead of showing a false credential state.

The main fields are name, verified email and password access. Email opens the verified-address workflow; the password control opens existing SMS recovery. The user’s phone identity remains the authentication authority. City and biography editing are retained on `/account/details`, linked after the source form. The extra link and remove-image action are functional extensions. Uploaded profile images replace initials only after the real storage/API operation succeeds. Image bytes use the existing validated media path and are included in paired SQLite/media backups. Replaced/deleted avatar URLs are no longer served, while immutable storage objects are retained for backups already in progress.

### Home V2 and event program continuation

Screen 18 (`608:18`, dark `1440:4896`) is available at `/?layout=v2`; `/` retains screen 17. The source has no prototype control for switching these alternatives, so no invented in-app switch was added. Its category tabs filter actual catalog events. Card variant 2 (`1444:11146` / `1475:8309`) is 250×290 with a 20px image mask, 48px date badge/radius 10, and 226×106 inset panel at 12,172. Panel shadow is 4/8/16, gray-900 at 20%. Tabs and upcoming cards start at y156/y260 after excluding the 44px OS status area. Suggestion lists reuse the price action variant. Scroll snap now accounts for the source's 24px carousel gutter. Home search uses the plain source component; the category screen retains Search-2's location chip. The notification dot is conditional on stored unread notifications.

Screen 21's agenda (`1444:11142` / `1444:11136`) uses a 201px card, 64px avatar at y24, title y100, speaker y125, and time y159. The first source width is 156 and the second 153; the implementation currently uses the 156px card for dynamic agenda entries and records this 3px difference for final QA. Agenda and video appear only when configured by the host. Video trigger `1270:2301` is 113×40, radius 12, black gray-900 with 4/8/16 shadow at 24%; native device chrome is omitted. Screen 22 is represented by a real HTML media element and custom source controls with fullscreen support; it follows actual viewport orientation rather than rotating an interactive page.

Screen 24's five calendar choices are independent event records in a host-owned series. Date cells are 56×56, radius 12; selected fill is the inherited Secondary/Base style (`1219:274`), not the stale local white paint. An event with fewer editions renders only its actual dates. Changing dates navigates to that edition and preserves independent inventory, tiers and checkout draft keys.

### Ticket and sharing comparison

Ticket detail `1444:11296` has no theme variant or instance paint overrides: its 327×556 holder is Primary/Base with radius 32 in both themes, and the inner white stub is 259×300 at x34/y222. The source's upper slot, two 30px cutouts, title/dividers and 211×38 barcode area are now separate DOM/CSS/SVG elements. The linear barcode encodes the actual reservation ID using Code128; it is a booking reference, while entry scanning continues to use the secure per-ticket QR token. The source's nonexistent seat value is replaced with actual quantity. At QR screen 41, the card starts at browser y104; 180px QR, 64px thumbnail, radius 32 and source controls are retained. PDF ticket download remains on detail, while QR view can download/share the genuine PNG. Native file sharing falls back to copying the actual entry token with an explicit status.

Sharing `1444:11754` is 360px high after excluding the 34px device gesture indicator. The 80px image begins at y82, link/copy row is 32px high, divider y196 and social row y228. The four source assets are preserved, including the embedded Twitter PNG and Instagram's native radial-gradient vector. Instagram invokes the platform's share picker; browser APIs cannot force the Stories destination. Where native sharing is unavailable, it copies the real event link and reports that outcome. Facebook/Twitter open share composers and email opens the user's mail handler. Nothing posts automatically. Source pagination dots were omitted because the file provides no additional target pages or wired interactions.

## Final integration notes

Checkout contact/order geometry was rechecked against nodes 608:34–35 and their dark counterparts. The organizer-update checkbox persists a follow; policy consent is expressed in the source text position. Only the real Zarinpal/free payment method is shown. The 52-screen route/state inventory records the explicitly excluded social-login screen. Final browser evidence, runtime checks and deliberate domain adaptations are consolidated in `visual-qa.md`.

The final recovery comparison added source illustration frames `1234:1060`, `1440:4045`, `1236:1173` and `1440:4027` as 152×152 vectors. Their 40px heading gap, 32px field gap and bottom action placement are retained. Consumer body spacing is isolated from legacy management navigation.
