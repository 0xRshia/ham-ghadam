# Final verification — 2026-09-30

The implementation was validated locally in `/Users/admin/repo/ham-ghadam`, using Node 22.23.1. No production deployment, remote Git mutation, external SMS/email/push delivery or real payment was performed.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | 0 errors; 32 native-image optimization advisories |
| `npm run test:sqlite` | Passed: transaction rollback, parameter binding, foreign keys, event normalization, migration preservation, registration boundaries and reservation history |
| `npm run test:media` | Passed: signature/dimension validation, upload bounds, immutable storage and paired media/database backup/restore |
| `npm run test:notifications` | Passed: actual VAPID encryption, endpoint validation, queue leases/retries, preferences, verified email and recipient opt-outs; delivery transports isolated |
| `npm run test:account-checkout` | Passed: destination handling, payment return routes and quantity limits |
| `npm run test:d1-migration` | Passed: migrations through 0015 preserve data, ticket tokens, indexes and foreign keys |
| `npm run build:node` | Passed: standalone production output |
| `npm run test:integration:node` | **497 checks passed** |
| `npm run build` | Passed: Workers production output |
| `CI=true node tests/integration.mjs` | **490 checks passed** |
| `npm run test:build-assets` after each build | **114** stylesheet/module preload URLs resolve in each output |
| Production `tests/visual-browser.mjs` | **85 captures**; both themes, genuine booking/community/program persistence, 320/375/390/430px checks, no unexpected console/page errors |
| Production `tests/visual-recovery.mjs` | Both themes; **10 captures**, actual OTP consumption/reset/session APIs, source illustration bounds asserted at 152×152 and y72 |
| Production `tests/visual-supplement.mjs` | Both themes; search, map selection/tile failure/attribution, share dismissal, loading state and document-preserving navigation passed |
| Gallery integrity | **111 retained captures**, 105 paired source references; all image paths resolve |
| `git diff --cached --check` | Passed |

The gallery also retains focused agenda, video, edition and venue-map captures from their comparison loops. It contains 55 light and 56 dark captures, including management extensions without a consumer source frame. The broad suite includes adjacent-width assertions rather than an extra screenshot for every width.

The final source-only changes after the 497-check Node API run concern recovery illustrations/layout and browser QA. Recovery was exercised again against the final Node production build; all API and migration code was subsequently covered by the 490-check Workers run. Local D1 migration preservation was also checked separately before the final visual refinements.

An initial final Workers attempt stalled after a successful local migration command; rerunning in noninteractive CI mode completed all 490 checks. No failing check was ignored. Expected local SQLite experimental notices and native-image lint advisories are not browser runtime errors.

See [visual QA](visual-qa.md) for source geometry, deliberate adaptations, limitations and reproduction instructions, and [the comparison gallery](figma/qa/index.html) for the retained screenshots.
