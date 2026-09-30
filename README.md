# هم‌قدم — Evenline Persian adaptation

A Persian, RTL event discovery and booking application, reconstructed from the supplied Evenline Figma file. It preserves Hmghadam's existing Next.js App Router / vinext, SQLite/D1, media storage, SMS verification and Zarinpal architecture. Google and Apple sign-in are deliberately excluded.

## Run locally

Use Node 22.13 or newer, install with `npm ci`, and configure the variables in `.env.example`. The standalone server reads process environment variables; export them or use your service manager's environment file. Set absolute database/media paths and an origin matching the chosen port.

```sh
npm run db:migrate:node
npm run dev
```

Set `MVP_RUNTIME=node` for local SQLite. The development command starts on port 5173 and reports the next available port if occupied. Keep `APP_ORIGIN` consistent with that URL. `npm run build:node` produces `dist/standalone/server.js`; `npm run start:node` runs it, using `HOST` and `PORT` when supplied. The Workers build remains `npm run build`, with D1 and R2 bindings from the existing configuration.

The default catalog contains real published database records. Sample events require `SEED_SAMPLE_EVENTS=true`; they stay visibly labeled and cannot take real payments. Development login/payment bypasses are off unless explicitly enabled. Do not enable those flags in production. Migrations are additive and preserve existing reservations and ticket credentials. Back up the database and media together before applying them to an existing installation.

## Implemented flows

- Welcome, city/interests/onboarding, phone/password sign-in, signup and recovery.
- Both home layouts (`/` and `/?layout=v2`), categories, search, filters and maps.
- Event detail, agenda, video, share sheet, organizers, follows, collections and favorites.
- Date editions, ticket tiers, buyer details, order/payment, real reservations, ticket history, barcode references, admission QR codes and PDF downloads.
- Profile and avatar editing, settings, notifications, verified email, browser push, FAQ, privacy and About.
- Existing host/admin/scanner/receipt workflows, plus host ticket-tier and program/series editors.

Paid checkout needs Zarinpal configuration. Phone signup/recovery needs Kavenegar and an OTP secret. Free reservations and password sign-in for existing password accounts work without those providers. Email and push delivery require credentials and a scheduled delivery job; no external delivery or production deployment was performed during implementation. See [notification setup](docs/notifications.md), [event programs](docs/event-programs.md) and [map configuration](docs/map-provider.md).

## Validation and design evidence

```sh
npm run typecheck
npm run lint
npm run test:sqlite
npm run test:media
npm run test:notifications
npm run test:account-checkout
npm run test:d1-migration
npm run build:node
npm run test:build-assets
npm run test:integration:node
npm run build
npm run test:build-assets
npm run test:integration
```

Build and integration commands for the two runtimes must run sequentially because they share `dist`. Integration tests use isolated databases and default to loopback port 5188, separate from development previews. External SMS/payment/email/push are not sent.

Read the [Figma audit](docs/figma-audit.md), [tokens and geometry](docs/design-system.md), [52-screen map](docs/component-inventory.md), [RTL/localization review](docs/rtl-localization.md), and [visual QA](docs/visual-qa.md). Open the [111-capture comparison gallery](docs/figma/qa/index.html) for paired source and implementation images.

## Runtime decisions

**Learning notes:** the retained vinext beta emitted broken prefetch imports and CSS-only JavaScript preload URLs during production browser QA. Shared links default to `prefetch={false}` while retaining router navigation. Global scanner, attendee and map styles are imported once from the server layout. `test:build-assets` checks that every RSC preload URL exists in the emitted output.

**Why this matters:** API success alone did not catch browser console failures. The retained screenshot and browser checks exercise actual rendered pages, controls, persistence and both themes. These compatibility changes are isolated and can be revisited when upgrading the framework.
