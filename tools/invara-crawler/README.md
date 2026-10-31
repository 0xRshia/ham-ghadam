# Public catalogue crawlers and viewer

Standalone crawlers for Invara places, [Jabama events in Tehran](https://jabama.events/all?city=tehran), and [Davvvat public events](https://davvvat.ir/). The local Persian/RTL panel has separate **Events** and **Places** sections. This tool does not import into the app database or publish anything.

## Jabama and Davvvat event crawlers

Run from `tools/invara-crawler` on Node 22.13 or newer:

```sh
npm ci
npm run build
npm run crawl:jabama
npm run crawl:davvvat
# Or collect both hosts concurrently, with sequential requests within each host:
npm run crawl:events
npm run viewer -- --out ./exports/all-public --events ./exports/events --port 4318
```

Open [the event panel](http://127.0.0.1:4318/events) or [the places panel](http://127.0.0.1:4318/places). When event data exists, `/` opens Events. Search event titles, descriptions, locations, organizers and categories; filter by source, shared category, city, dates (all/current and upcoming/past), free admission, online events or photos. Details include the description, date/time, source price, address/map, organizer, public sessions/reviews when supplied, terms, gallery, video links and complete downloadable JSON. URLs retain filters and the selected event. New event exports load automatically; the panel refreshes once a minute while idle or with **تازه‌سازی**.

Each source has its own adapter. The default Jabama scope matches the requested Tehran link; its sitemap covers other cities, so candidate details are city-checked before inclusion. Public theater pages in its separate sitemap are included. Davvvat includes all public event URLs in its sitemap/homepage, across cities and online. Jabama's city landing is curated; its visible cards alone are not a complete inventory. Reports record sitemap audits, excluded cities, missing URLs and failures.

Both crawlers read `robots.txt`, fetch public HTML/XML pages, and decode the data embedded in the rendered page. They do not issue `/api/` or `/cms-api/` requests, sign in, follow private/account/checkout routes, submit forms or download media files. Davvvat descriptions come from the full rendered payload rather than its truncated SEO description. Original HTML, metadata, source categories and unknown event fields are retained.

The default delay is two seconds between request starts **per host**; `--delay-ms` cannot be below 1,500. HTTP 429 and temporary server errors trigger exponential backoff, honoring a longer `Retry-After`. Cooldowns survive restarts. Access-denied/challenge pages stop that source without attempting to evade the restriction. Normal failures remain listed for a later resume. One output-folder lock prevents duplicate jobs.

```sh
# A pilot (maximum new candidate details per source in this invocation):
npm run crawl:events -- --limit 10 --out ./exports/events-pilot
# Resume the same inventory and skip completed details:
npm run crawl:events -- --out ./exports/events
# Refresh discovery and details for a new snapshot:
npm run crawl:events -- --refresh
# Include all Jabama cities instead of Tehran:
npm run crawl:jabama -- --city all --out ./exports/events-all-cities
# Reparse cached pages without network requests:
npm run crawl:events -- --offline --refresh
# Rebuild combined JSON/CSV from source exports:
npm run export:events
```

Exports live under `exports/events/`, with the same tables in `jabama/` and `davvvat/`:

| File | Contents |
| --- | --- |
| `events.json`, `events.csv` | Event fields, descriptions, calendars, location, organizer, prices, media, terms and raw data |
| `photos.json`, `photos.csv` | Image URLs, roles, thumbnails when supplied and raw metadata |
| `categories.json`, `categories.csv` | Event-category associations, mapping method and evidence |
| `taxonomy.csv` | Shared Persian labels and counts |
| `catalogue.json`, `run-report.json` | Combined data and per-source coverage reports |
| `<source>/inventory.json` | Sitemap/listing inventory, audits and robots text |
| `<source>/crawl-report.json`, `checkpoint.json` | Progress, exclusions, missing URLs, errors and resumable state |
| `<source>/records/`, `pages/` | Detail records and original HTML captures with URLs/timestamps |

Identity is source-specific (`jabama:…`, `jabama:theater:…`, `davvvat:…`); an event advertised by both sites remains traceable to both listings. Shared categories use explicit source mappings and conservative title rules. `method` and `evidence` distinguish them; `source_categories` retains the originals. Unclassified events have an explicit “other” category.

Calendar dates and clock fields remain as supplied. Davvvat date anchors are not guessed to be event instants. Jabama session instants use Asia/Tehran. Prices are not converted: `IRT` is toman, `IRR` is rial, and missing currencies/amounts stay null. Conflicting SEO values remain available with a warning. Missing optional descriptions, prices, photos or sessions are not invented. Source links/photo URLs can change after collection.

Exit `0` means the recorded source inventories/detail targets were processed; `2` means a pilot/partial/blocked run; `1` means a setup/discovery failure. Read source reports before treating an export as complete. Repeat the command to resume; separate output folders create independent snapshots. Event CSV uses the quoted UTF-8/BOM, nested-JSON and spreadsheet-formula protections described below.

## Invara place crawler

Standalone Node/TypeScript CLI for a sample or full crawl of public Invara venue pages. This package has its own dependencies, build, tests, checkpoints, and exports. It does not use or modify the Hamghadam app, its database, or its environment files.

## Install and run

Requires Node 22.13+ and Google Chrome. From this folder:

```sh
npm ci
npm run build
npm run crawl -- --limit 50 --out ./exports/pilot-50
```

If Chrome is not installed, install Playwright's Chromium and select it:

```sh
npx playwright install chromium
npm run crawl -- --channel chromium --limit 50 --out ./exports/pilot-50
```

The default run uses one browser page, a 1.5-second delay between navigations/pagination actions, 45-second timeouts, and two additional attempts. It respects `Retry-After` on captured 429 responses. Run `npm run crawl -- --help` for all flags. `--headed` shows the crawler browser.

Collect the complete public map inventory, including venues outside the pilot's first 50 results:

```sh
npm run crawl -- --all --workers 2 --delay-ms 3000 --out ./exports/all-public
```

`--all` reads the unpaginated public map inventory, audits all published food/suitability filters, metro/traffic/pollution filters, and four overlapping 50 km circles. Every unique venue ID in those responses is visited. The report records each audit URL, its IDs, and whether the response indicated truncation/pagination. This establishes coverage of the published public catalogue, not access to private backend records. The 25 October 2026 map exposed 8,690 venue IDs; its points lay within about 25.1 km of the default centre, well inside the 50 km search radius.

`--workers` uses 1–8 page workers with a **shared global** navigation/pagination rate limit. Any observed 429 pauses all workers according to Retry-After and increases the shared delay. Detail caches are written after each venue. Chrome blocks binary media URLs on `media.invara.top` through CDP, preserving HTTP cache for scripts and retaining every supplied image URL without downloading image bodies. The full mode allows up to 10,000 public review pages per venue; reaching a cap is reported as incomplete.

For a long run, use the recovery supervisor. It resumes saved records after browser/process failures, uses a singleton lock, writes `job-status.json`, and refreshes the browsable catalogue and JSON/CSV snapshots every five minutes:

```sh
npm run supervise -- --out ./exports/all-public --workers 2 --delay-ms 3000
npm run snapshot -- --out ./exports/all-public
```

`crawler-status.json` records active venue IDs, response activity, and pending body reads. Response bodies have the configured timeout so an unfinished script cannot stall all workers. The supervisor recovers after ten minutes without activity, except during a server-requested pause. `rate-limit-state.json` preserves Retry-After and adaptive delay across restarts. Each child has its own process group so recovery also cleans up its browser.

`catalog.json` and `catalog.csv` contain every discovered venue immediately. Their `enrichment_status` is `pending`, `partial`, or `complete`; address/categories/photo URLs/review counts remain null until a detailed record has been captured. `stores.json`/`stores.csv` contain the saved detailed records only. Individual detail JSON files under `checkpoints/` are updated immediately. HTTP 409 responses identifying unsupported geographic areas are recorded as `unavailable_reason` in the audit, rather than retried as missing catalogue pages.

The crawler reads `robots.txt` and checks the public page paths against its wildcard-agent rules. Invara currently allows public pages and disallows `/api/`. The tool visits `/explore` and `/places/{id}`, observes the public GET place responses generated by those pages, and never issues its own place API requests or replays captured requests. Normal frontend traffic still includes API requests. It uses a fresh anonymous context and does not sign in, visit user profiles or saved lists, submit forms/reviews, or follow external menus/Instagram links. Review requests with `scope=mine` or `scope=following` are excluded from capture.

## Scope and sampling

The 50-store pilot takes the first 50 distinct IDs in the site's default discovery order. Discovery loads batches of 20, so a 50-store pilot ordinarily observes 60 listing entries and visits exactly 50 venue detail pages. It is a convenience sample, not a random sample or a full-site crawl. The initial list currently uses popularity ordering within a 50 km area around Tehran; actual search URL parameters are recorded in the report. The homepage-only sitemap does not establish complete site coverage.

The browser waits for actual place responses, validates the detail ID, retains original category codes and Persian tag labels, and follows public review pagination through the UI. Full review text and timestamp strings come from the response, so collapsed text and relative dates in the UI do not truncate the data. Reviews with no written body are retained because their reactions still contain information. The default review safety cap is 100 pages per venue; reaching it marks the record incomplete and gives the process exit code 2.

All fields in the source venue record and source listing are retained in `raw_place` and `raw_listing`. Original coordinate strings remain there even though convenience columns use numbers. `price_level` is the source's ordinal value, not a currency price. Absent optional values remain null/absent; the crawler does not invent opening hours, contact details, ratings, or a business's official Instagram account from reviewer links.

## Local catalogue viewer

```sh
npm run build
npm run viewer -- --out ./exports/all-public --port 4318
```

Open `http://127.0.0.1:4318`. The Persian/RTL viewer searches all exported venues by name, address, category or feature, with Persian/Arabic spelling normalization. Filter by any category or venues with photos, sort by name/photos/reviews, and browse paginated results. A venue opens its details, public reviews, full source data and an original-photo gallery with keyboard navigation. Thumbnail/original URL variants are grouped into one photograph. Search, filters, pages and open venues are reflected in the URL.

The viewer loads the existing `stores.json` on the local server; the browser receives small result pages and individual records on demand. It does not recrawl Invara. Photos load from their saved public URLs when displayed, so they require an internet connection and may become unavailable at the source. Failed images have a visible fallback. CSV/JSON download links use the existing exports. Category names are translated for the interface; source category codes and raw exports remain unchanged.

The server binds to `127.0.0.1` only and serves an explicit asset/download allowlist. Scraped text is escaped when rendered. It uses the project's existing Darbareh font; provenance is in `viewer/FONT-SOURCE.md`. Restart the viewer to load a newer export.

## Exports

Files are written under `--out` (ignored by Git by default):

| File | Contents |
| --- | --- |
| `invara.json` | Main bundle: run report, taxonomy, and all nested venue records |
| `stores.json`, `stores.csv` | Collected venue records, including raw source fields and page metadata/text |
| `photos.json`, `photos.csv` | Venue/review image URLs with venue ID, review ID, variant role, position, and raw image metadata |
| `reviews.json`, `reviews.csv` | Public review/reaction records, full bodies, timestamps, public author metadata, food tags, images, and source post references |
| `classifications.json`, `classifications.csv` | Venue-category, venue-tag, and review-food associations with provenance |
| `taxonomy.json`, `taxonomy.csv` | Observed category codes/tag labels and food/suitability filter definitions parsed from the scripts loaded by the page |
| `run-report.json`, `run-report.csv` | Counts, coverage, geographic scope, incomplete records, failures, timestamps, and limitations |
| `source-responses.ndjson`, `.json`, `.csv` | Journal and exports of captured public place responses, including pagination envelopes and their URLs/status/timestamps |
| `reference-data.json`, `reference-data.csv` | Public metro/traffic/pollution metadata actually loaded by the browser; latest response per resource URL |
| `errors.json`, `errors.csv` | Attempt/capture failures; successful retries remain in the history |
| `checkpoint.json`, `checkpoints/*.json` | Resumable discovery state and an atomic cache per venue |

Photo files are not exported/downloaded to disk; image URLs are retained and Invara media requests are blocked. Original and thumbnail URLs are separate variants, so URL count can exceed the number of distinct photographs. Reviewer avatars are retained as author metadata but are not counted as venue/review photographs.

Food tags attached to reviews are exported with the review ID. They are not presented as an official venue menu or a definitive business category. Unknown category labels remain null rather than being translated speculatively.

CSV files use UTF-8 with BOM for Persian/Excel compatibility, CRLF record separators, quoted values, and JSON strings for nested objects/arrays. `stores.csv` summarizes photo/review counts; complete review rows are in `reviews.csv`. Unknown venue fields remain in the raw JSON columns; unknown review fields are included as CSV columns. Spreadsheet-formula-looking text is prefixed with an apostrophe in CSV, including fields starting with `=`, `+`, `-`, or `@`; JSON preserves original text exactly.

## Resume and offline export

Repeat the same command and output folder to skip already completed venues. Incomplete venues are revisited. `--no-resume` revisits the selected venues and replaces their record caches. Use a new output directory for a new independent sample; the response journal in a reused directory retains all attempts.

Rebuild exports without contacting Invara:

```sh
npm run crawl -- export --out ./exports/pilot-50
npm run crawl -- export --out ./exports/all-public
```

`Ctrl+C` requests a stop after the current venue and writes partial exports. Exit 0 means all requested venues and their public review pages were captured; exit 2 means the export is partial; exit 1 indicates a fatal setup/discovery error. Read `run-report.json` for details. Optional missing fields do not make a venue incomplete.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Tests include a real browser run against a localhost fixture server. They verify discovery/review pagination, duplicate IDs, an HTTP failure/retry, exact requested sample size, raw unknown-field preservation, photo variants, CSV quoting/formula safety, automatic resume, and offline export. They do not write to Invara or the app database.
