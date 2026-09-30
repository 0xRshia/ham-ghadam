# Evenline design system in Hmghadam

The consumer UI is implemented in `components/evenline`, with exact source metadata in `docs/figma/source` and centralized tokens in `design-system/tokens.css`. It retains the existing React/Next/vinext architecture, npm lockfile, API/database adapters and Iranian event domain. No visual component library supplies the Evenline styling. Existing host/admin/scanner tools remain available; new host editors reuse the source inputs and controls.

## Source authority

Prefer component variants, inherited styles, Auto Layout, screen geometry, then exported PNGs. A node's local paint can be stale when an inherited style is present: the selected date (`1219:274`) inherits Secondary/Base even though its local paint is white. `scripts/figma/export-assets.py` resolves these relationships and exports actual paths, strokes, transforms and supported gradients. It refuses unsupported paints rather than silently substituting icons. Metadata and reference screenshots are not loaded into the application bundle.

## Theme roles

| Role | Light | Dark |
| --- | --- | --- |
| Background | White | Gray 900 |
| Surface | White | Gray 800 |
| Inset controls | Gray 50 | Gray 800 |
| Primary text | Gray 900 | Gray 50 |
| Muted text | Gray 400 | Gray 400 |
| Divider | Gray 100 | Gray 700 |
| Accent | Primary/Base | Primary/Base |
| Price background | Primary 100 | Gray 700 |
| Navigation inactive | Gray 400 | Gray 500 |

Exact floating-point RGB values and the full palette are retained in tokens and the foundation audit. `.el-app` binds semantic roles; `.dark .el-app` switches their values. Some source objects are intentionally invariant: the orange ticket holder/white stub and brand artwork must not be automatically recolored. Theme-aware SVG pairs preserve the source icon paints. Geographic tiles retain their provider style; see `map-provider.md` for the contrast exception.

## Type and localization

The source's Noto Sans JP hierarchy maps to the project’s existing IRANSansX assets. Body sizes are 10/12/14/16/18px at 1.5 line height; headings include 20/24/32/40/48px with source-specific heights. Persian typography uses no synthetic Latin tracking. Bold/medium/regular distinctions remain semantic. Containers keep source geometry; titles clamp or truncate instead of expanding cards. UI copy is centralized in `locales/fa.ts`; editable product content and domain records remain API data.

Use Persian/Jalali dates in Asia/Tehran, Persian displayed digits and toman prices. Internal timestamps, IDs, amounts and API fields remain normalized. Email, URLs, barcodes and codes use isolated LTR composition. See `rtl-localization.md` for directional review.

## Layout and geometry

The reference frame is 375×812 with 24px content gutters and a 327px content width. The browser omits the drawn 44px status bar and 34px gesture area; real `safe-area-inset-*` values are honored. The app stays at 375px maximum width and adapts its content at smaller widths instead of scaling the whole UI. Carousels preserve fixed card sizes and native RTL scrolling, including source gutter-aware scroll snapping.

| Component | Visible geometry |
| --- | --- |
| Header / home header | 56 / 72px high |
| Bottom navigation | 64px plus real bottom inset |
| Search, input, primary button | 56px high; radius 16 |
| Event card V1 | 272×270; image 248×140 |
| Event card V2 | 250×290; radius 20; inset 226×106 |
| Event list | 327×120; image 88×96 |
| Category card | 327×160; radius 16 |
| Date badge / edition choice | 48×48 / 56×56 |
| Agenda card | 156×201; avatar 64px |
| Notification setting | 327×80; icon 48px; switch 44×24 |
| Ticket holder / inner stub | 327×556 / 259×300 |
| QR card | 327×389; QR 180px |
| Share sheet | 360px plus real bottom inset |

Visible bounds differ from blur bounds. Shadows and blurs are separate noninteractive layers; they must not enlarge flex items. The 2/4/6/8/10/12/16/18/20/24/32/40/48/56/64/72/80 spacing values are reusable tokens only where actually used. Unique offsets remain beside the component with a source reference. Radius tokens include source values 4/8/10/12/16/20/24/32 and circular 1000. Do not replace them with framework presets.

## Components and states

Primitives include source icons, native buttons/inputs, headers, date badges, avatars, switches, OTP cells and section headings. Composite APIs represent card/list/feature variants, organizer cards/rows, collection cards, booking cards, ticket tiers, calendar choices, source skeletons and confirmation/share sheets. Themes do not duplicate component markup. The full source inventory and numbered-screen mapping are in `component-inventory.md`.

Loading is driven by actual fetch or route state; no artificial splash delays exist. Disabled/empty/error states reflect real backend or provider availability. Native dialogs provide keyboard focus containment and Escape dismissal. Real media controls derive duration and progress from HTML media events. Clipboard/native share actions report only completed local actions, never a successful external post.

## Effects and exceptions

Card V2 uses the exact 4px/8px/16px gray-900 shadow at 20%. The video trigger uses the same offsets at 24%. Ticket holder glow, top slot and QR shadow derive from their source nodes. Source radial/linear gradients remain vector assets where their transforms are significant. No new motion system was inferred: the file has no wired prototype transitions, so state changes are immediate except established browser/media behavior.

Functional adaptations are documented in the source audit: six-digit Hmghadam verification, no Google/Apple sign-in, genuine payment methods, independent dated event editions, secure admission tokens, initials for accounts lacking images, provider attribution and accessible error states. These do not pretend source sample data is production data.

Checkout refinements use the source's 327×335 contact panel (20px radius), 287×56 fields, 20px input padding, 16px field gaps, 327×60 update row and 148px purchase CTA. The order card uses the source 88×96 image, 14px two-line title and 10px calendar/time rows; one selected tier produces a 208px summary with subtotal, fee and total. Further tiers grow the summary as actual order data requires. The update control persists an organizer follow, and consent is stated beside the source policy text. Payment shows only the actual configured Zarinpal/free method.

Global scanner/attendee/Leaflet styles are loaded by the server layout to avoid missing CSS-only preload chunks in the retained framework beta. Their selectors remain scoped. Consumer components continue to consume only the source-derived Evenline visual system.

Recovery/verification use the 152×152 source illustrations, a 40px gap before the heading and a 32px gap before the fields. Source headings use 24/36 and descriptions 14/21. The consumer shell owns its navigation and safe-area padding, overriding inherited body spacing from management pages.
