# Notifications and browser push

`/settings/notifications` saves account notification preferences and lets an authenticated user subscribe the current browser. The browser permission prompt only runs after the user turns on the device switch. Unsupported browsers and unconfigured delivery display their actual state. Google and Apple account sign-in remain excluded. Apple's browser push service is an HTTPS delivery endpoint, not an account integration.

## Configuration

The Node and Workers deployments read the same environment keys:

- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`: a matching P-256 Web Push key pair. Generate once with the installed `web-push` package's `generateVAPIDKeys()`. Keep the private key in deployment secrets and preserve the pair across restarts.
- `VAPID_SUBJECT`: the operator's `mailto:` contact or HTTPS contact URL.
- `NOTIFICATION_JOB_SECRET`: an independently generated secret of at least 32 characters for the job endpoint.
- `APP_ORIGIN`: the canonical HTTPS application origin.

No delivery keys are included in source control. Only the validated public key is returned to the signed-in browser. A key rotation requires existing browsers to subscribe again.

Run `node scripts/notifications-job.mjs` with the application's environment from the deployment's scheduler every five minutes. An HTTP scheduler can instead POST to `/api/jobs/notifications` with the same bearer secret. The endpoint works on both runtimes; no scheduler or production service has been activated by this implementation. The script logs only aggregate delivery counts.

The job generates actual in-app notifications even when VAPID keys are absent. It creates upcoming reservation reminders, new published events from followed organizers, newly added events in followed public collections, and upcoming favorite events. Booking confirmation already produces its own notification when tickets are issued. Liked-event and collection alerts have independent opt-in switches. Each generation pass adds up to 100 pending records of each kind; repeat passes drain larger batches. Reordering a collection preserves membership timestamps and does not create fresh alerts. Sample events never generate reminder or followed-event alerts.

## Delivery and privacy

Subscriptions are tied to a session hash. Signing out or password recovery revokes them. Expired sessions cannot receive delivery. A user can register up to five active browser endpoints. The status check sends a SHA-256 fingerprint rather than exposing the full private endpoint in URL logs.

Outbound delivery is restricted to the standard Google, Mozilla, Apple, and Microsoft push-service hosts. The server validates the P-256 public key and auth secret before storing them. Requests use authenticated, encrypted `aes128gcm` Web Push payloads, HTTPS, a five-second timeout, and no redirects. Push payloads contain only the selected notification; the separate email channel requires verified-address consent.

Each job claims up to 24 notifications in batches of four. A database lease prevents concurrent jobs sending the same notification at once. Unsuccessful requests use exponential backoff and stop after five attempts; expired endpoints (404/410) are deleted. Opt-outs, cancelled bookings, expired/revoked sessions, unfollows, private collections, and expired events are rechecked before delivery. Read notifications and historical messages from before a browser subscribed are excluded.

Delivery is bounded, at-least-once where retries remain: a process can crash after the provider accepts a request but before the database records success. The service worker uses the notification ID as its tag to replace duplicate visible notifications. Provider acceptance does not guarantee browser display. Push providers may retain an accepted encrypted payload for up to five minutes, so revocation cannot withdraw a message already accepted by the provider.

The service worker does not intercept network requests or cache pages. Clicks are limited to the application's own origin. All display copy comes from the Persian content layer or actual event titles.

## Validation

`npm run test:notifications` validates real encryption with ephemeral test keys, URL/key validation, idempotent generation, privacy checks, opt-outs, leases, retry limits, and cascading session revocation without sending external notifications. `tests/push-integration.mjs` exercises the real HTTP handlers on both production runtimes. Browser QA verifies source-derived row geometry, persisted switches, and truthful unavailable states.

## Learning Notes

The existing session is the right boundary for browser subscriptions: it already represents which account is allowed to use that browser. Linking delivery to it also makes password recovery revoke old devices. Drizzle Kit 0.31.10 omitted the requested cascade when adding the session-reference column, so migration `0012_push_session_revocation` supplies an explicit revocation trigger for databases that applied `0011`.

## Why This Matters

A browser permission alone does not identify the currently signed-in account. Session-bound subscriptions and delivery-time checks prevent a shared browser from continuing to receive another account's future notifications after logout.

Implementation references: [web-push request generation](https://github.com/web-push-libs/web-push#generaterequestdetailspushsubscription-payload-options), [PushManager.subscribe](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe).

## Email alerts and weekly recommendations

Email uses a small Resend REST adapter in `lib/email-protocol.ts`. This is the default pending the user's optional provider preference; the adapter can be replaced without changing verification, preferences or the queue. No Resend account, sender domain or delivery credentials have been provisioned.

Configure `RESEND_API_KEY`, a plain verified-domain sender address in `EMAIL_FROM`, and a separate random `EMAIL_TOKEN_SECRET` of at least 32 characters. `APP_ORIGIN` must be HTTPS. The sender's domain must be verified with Resend. The API key stays server-only. No email SDK or client-side API key is added.

`/settings/email` asks the signed-in account to verify its recipient address with a six-digit, ten-minute code. Codes are HMAC protected, bound to their account and address, limited to five attempts, single-use, and rate-limited by account, recipient and IP. A failed provider request does not claim delivery. The verified address is stored separately from the public profile. Verifying or changing an email resets email/newsletter opt-ins; the user must explicitly enable delivery.

Source screen 50 now has its seven controls: browser push, email alerts, newsletters, followed organizers, reminders, liked events, and followed collections. Email and newsletter switches default off. Email alerts require a verified address and configured provider. Weekly recommendations select up to three actual published, non-sample events in the next seven days matching the profile's city and interests. No newsletter is generated when no events match. Recommendations deduplicate by account and fixed seven-day period, and stale recommendations are withheld if the current public event selection changes before delivery.

The shared job sends up to four email messages per pass, sequentially, with five-second request timeouts. Messages use provider idempotency keys (Resend retains these for 24 hours), database leases, capped retries, and delivery-time consent/recipient checks. Historical messages predating verification or opt-in are excluded. Email delivery returns its own aggregate result alongside push delivery.

Every alert includes an unsubscribe link and one-click email headers. GET shows a confirmation page; it does not change consent, so email link previews cannot unsubscribe accidentally. POST accepts an account/address/version-bound HMAC without requiring login, allowing mail clients' one-click action. It immediately clears both email opt-ins and the address's delivery activation timestamp. Changing or removing the email invalidates its previous unsubscribe links. No unsubscribe token grants access to the account or its email address.

[Resend send-email API](https://resend.com/docs/api-reference/emails/send-email), [idempotency behavior](https://resend.com/docs/dashboard/emails/idempotency-keys), [one-click unsubscribe headers](https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails).
