# Visual QA

Reference frame: **375×812**. Browser captures use that viewport and native RTL. The source's drawn 44px status bar and 34px gesture bar are omitted; top content is compared after removing the status-bar offset, and fixed controls are compared relative to the browser's bottom safe area. Additional overflow checks cover 320, 390 and 430px widths.

The supplied editable `.fig` resolved the earlier MCP quota limit. Metadata, source variants and extracted vectors informed the comparisons; the PNGs provide the visual reference. There are no unresolved source-asset access blockers. Source frames have no wired prototype reactions, so route relationships follow their numbered states and the existing product's real behavior.

## Retained evidence

Open [the comparison gallery](figma/qa/index.html). It places the original screen beside each localized capture and identifies the source screen number. The original references remain in `figma/reference`; captures are in `figma/qa`. Different content, Persian font metrics, RTL composition and omitted device chrome make an unmasked whole-image pixel ratio misleading, so no numerical pixel-identity claim is made.

The broad browser suite captures both themes for:

- Home V1/V2, categories, results, filters and event details.
- Profile, edit profile, following, favorites and empty favorites.
- Organizer events/collections/about, collection detail and settings.
- Ticket selection, contact, order, payment, completion, ticket history, detail and QR.
- Notifications, notification settings, FAQ, privacy, About and language.
- Welcome's three steps, city choice, organizer onboarding and interests.
- Login/signup empty and filled, recovery, six-digit verification, new password and recovery success.

Supplemental checks cover source loading skeletons, share/modal dismissal, map marker selection, attribution, tile failure and search. Agenda/video/edition captures include real play/pause, seeking, mute, fullscreen and edition navigation. Avatar checks cover actual upload, persistence, replacement and removal. Test records and generated admission credentials are local fixtures; completed browser runs remove their accounts, reservations and events.

## Geometry and interaction checks

| Component | Source / validated dimensions |
| --- | --- |
| Content gutters | 24px, 327px content at reference width |
| Home V1/V2 event cards | Full content width, 250:290 aspect ratio; 24px corners; 16px inset translucent panel and upper-right date badge |
| Contact panel | 327×335, radius 20; fields 287×56 |
| Order summary | 208px for one selected tier; grows for additional real tiers |
| Ticket holder | 327×556 at x24/y80 |
| Ticket stub/barcode | 259×300; Code128 box 211×38 |
| QR card | 327×389 at y104; real 180px QR |
| Share sheet | 360px content; event y82; social row y228 |
| Avatar editor | 100px avatar at y88; source save control y670 |
| Notification settings | 327×80 rows; 48px icons; 44×24 toggles |
| Agenda | 156×201 cards; 64px avatars |
| Edition choice | 56×56, radius 12 |
| City / venue maps | 64px circle / 327×160 preview |

The comparison loop corrected shared paragraph-reset specificity, RTL carousel gutter snapping, dark header icons, profile input padding, contact field colors/radii/icons, order subtotal and footer geometry, ticket paper/barcode layout, the one-pixel QR divider error, agenda overflow, controlled video seeking, fullscreen targeting, missing recovery illustrations and inherited mobile body padding.

Browser interaction tests also found and fixed a checkout click that could immediately submit the next step's newly rendered form. Each footer is now keyed to its step. Contact information is visibly entered before order review; organizer-update consent persists a real follow. The host program editor was submitted, reloaded and checked through its API.

## Runtime validation

The [final verification log](verification-log.md) records production Node and Workers integration results, unit suites, type checking, lint and emitted asset validation. API suites exercise authorization, ownership, atomic capacity and tier inventory, idempotency, payment callbacks, OTP/password recovery, collections, notifications, email verification, media, agenda/series revisions and data-preserving migrations. No external SMS, payment, email or push was sent.

Production browser checks record console errors as well as page errors. They exposed broken automatic prefetch imports and CSS-only module preload URLs in the retained vinext beta. Prefetch is disabled by default on the shared link wrapper; router navigation remains active. Global CSS imports are consolidated in the server layout, and `tests/build-assets.mjs` verifies all RSC preload targets. The test server uses a separate port from the development preview.

## Deliberate adaptations and remaining limits

- Google and Apple sign-in are excluded by explicit instruction. The linked-social-account screen is therefore excluded.
- Phone identity and six-digit SMS verification follow Hmghadam's existing security protocol. Source email-login wording becomes phone/password login. Provider-unavailable states are explicit.
- Payment uses the actual Zarinpal/free booking flow. Unavailable foreign payment providers, saved card accounts and a nonfunctional one-click method are not advertised. The source payment-selection row geometry remains; a shorter list reflects the available provider.
- Source event names, people, prices, dates and event photos are replaced with actual Hmghadam records. Profile photos require real uploads; otherwise initials represent the actual name. Onboarding/About artwork and interface icons are extracted source assets.
- Booking dates are independent published events in a host-owned series; no invented dates or inventory appear. Ticket quantity replaces the source seat field because the current admission model is unassigned seating. The Code128 is the actual reservation reference; the existing secure QR remains the admission credential.
- Facebook/X/email open actual share composers. Instagram invokes the native share chooser where available; otherwise it copies the canonical link with truthful feedback. There is no claim of direct Stories publishing. Source pagination dots with no corresponding pages or prototype target are omitted.
- Map previews use real event coordinates and visible provider attribution. Dedicated map-failure checks abort tile requests to verify recovery without loading community servers. An earlier interactive preview loaded actual Tehran tiles. Provider cartography stays geographically LTR and uses its own light tiles in both themes; the dark venue caption has a solid contrast background. Hidden source gradients are not rendered.
- Agenda cards use the shared 156px width for dynamic records; the second isolated source card measures 153px. The three-pixel difference is retained as a documented minor deviation. Pause/fullscreen/error states are necessary functional extensions where the source supplies only a play state.
- Source and browser safe-area handling differ as described above. Persian is the only implemented language; the language screen does not offer fake translations. Editable Hmghadam FAQ/About content and the actual privacy policy replace source filler.
- External delivery, production gateway callbacks and device-specific native sharing require the deployment's credentials/device configuration. Their adapters, authorization and failure behavior are tested locally; no deployment or real payment was performed.

## Reproduce browser checks

For the first-visit map and home-card changes, run `npm run build:node`, `npm run test:discovery`, then `npm run test:discovery:browser`. The browser test creates, migrates, and removes its own temporary SQLite database and starts a production server on an available loopback port. It exercises live catalog APIs, blocks external tile traffic, checks both themes at 320/375/430px, and saves captures to `work/discovery-qa` (override with `VISUAL_OUTPUT_PATH`). Use `PLAYWRIGHT_MODULE` when Playwright is supplied by the workspace runtime. The broader visual suites mark the introduction complete; the discovery suite owns first-visit coverage.

Use an isolated migrated SQLite database with the Node production server at loopback port 5190, `HOST_PHONES=09900009992`, `SEED_SAMPLE_EVENTS=true` and a test-only `OTP_SECRET` of at least 32 characters. Set `VISUAL_DATABASE_PATH` to the same database and `VISUAL_ORIGIN` to that origin. The browser scripts use an installed `playwright` package, or a `PLAYWRIGHT_MODULE` absolute path to its module entry. Chrome must be available.

Run `node tests/visual-browser.mjs`, `node tests/visual-recovery.mjs` (also set `VISUAL_OTP_SECRET`), and `node tests/visual-supplement.mjs`. Recovery isolates only external SMS delivery; the actual challenge consumption, password mutation and session APIs remain live against the test database. Never point these fixture-writing scripts at a production database.
