# Persian / RTL

Document uses `lang="fa" dir="rtl"`. Use logical margins, padding and insets; flex order follows native RTL. Mirror directional arrows individually by rotation, never the document, photographs or logos. IRANSansX comes from the existing project. Central UI copy: `locales/fa.ts`. Existing API content stays data-driven. Internal timestamps and amounts remain numeric; display dates use `fa-IR-u-ca-persian` and `Asia/Tehran`, prices use toman and Persian digits. Safe-area device chrome is omitted.

Email addresses and confirmation codes use isolated LTR content inside the RTL application. Email and phone confirmations share the same six-digit control and normalize Persian/Arabic digits before API submission. Notification preference titles, availability states, verification messages and unsubscribes live in `locales/fa.ts`. The profile camera icon and uploaded photo are not reflected; the form's label, icon, text and trailing-control order follows RTL composition.

## Final review

- `locales/fa.ts` contains consumer labels and formatted copy; `locales/domain-fa.ts` contains retained host/admin/scanner/receipt labels and API validation messages, with named formatting functions. `locales/privacy-fa.ts` contains the privacy content. Editable FAQ/About/article data stays in the existing content model (`lib/initial-content.ts` seeds unpublished/editable content). Sample event data is a separately flagged, explicitly opt-in fixture source.
- The remaining Persian characters outside those layers are character normalization, numeric input parsing and parameterized search normalization, rather than UI sentences. FAQ topic matching and Persian category line breaks are in the locale layer.
- Repository search covered physical margins, padding, insets and alignment. The legacy blog uses logical leading alignment; card shadow offsets now use logical insets. The About photo crop and welcome collage logo keep physical coordinates because these are non-directional artwork. Leaflet tiles, video controls, phone/email/URL/code fields and QR/barcodes use their appropriate physical or isolated LTR direction.
- Back/forward arrows rotate individually. Photos, source illustrations, universal symbols, logos, play glyphs and map geography are never reflected. Native RTL flex order places leading imagery and trailing controls correctly; source spacing is preserved.
- Long event titles clamp to two lines in fixed cards. Agenda speaker names, city captions, collection titles and URLs truncate where the source geometry requires it. The reference and adjacent mobile widths were exercised with long Persian titles and mixed Persian/Latin inputs.
- The browser uses six OTP digits because the existing phone-verification protocol requires six. All other machine IDs, SQL/API fields and numeric storage remain unchanged. Toman is the displayed unit; the payment adapter retains its required rial conversion.

The locale modules preserve the original domain messages while centralizing their ownership. A future language can provide equivalent named content without rewriting component markup or API validation logic.
