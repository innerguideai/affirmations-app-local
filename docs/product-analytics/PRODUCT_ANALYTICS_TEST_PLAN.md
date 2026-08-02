# Product Analytics — Test Plan

Status: **proposal.** The app's existing test surface (per [Current State](PRODUCT_ANALYTICS_CURRENT_STATE.md)) is entirely Appium/WebdriverIO UI-driven (`tests/runner.js`, root `appium-smoke.js`) — there is **no unit-test framework** (no Jest/Mocha in `package.json`) and **no backend integration-test harness** today. This plan therefore proposes the testing infrastructure needed for analytics alongside the tests themselves, rather than assuming a harness already exists to slot into.

---

## 1. Unit tests (new infrastructure required — none exists today)
| Area | Representative case | Expected result |
|---|---|---|
| Event envelope validation | Missing `eventId` | `400`, field-level error |
| Event envelope validation | `schemaVersion` unrecognized | `400`/rejected, not silently parsed |
| Property allowlist | `properties.emotionCategory = "sad"` on `emotion_selected` | Accepted |
| Property allowlist | `properties.rawEmotionText = "my boss yelled at me"` on `emotion_selected` | Stripped, event still accepted with the field removed, stripping logged |
| Sensitive-value rejection | `properties.note = "reach me at a@b.com"` | Whole event rejected `422`, not just the field stripped |
| Sensitive-value rejection | A JWT-shaped string in any property value | Whole event rejected `422` |
| Identifier resolution | Authenticated request, first event ever for this `appUserId` | New `identity_link` row created, `analyticsUserId` returned/used is fresh |
| Identifier resolution | Authenticated request, `appUserId` already has a link | Existing `analyticsUserId` reused, no duplicate row |
| Guest→account merge | Guest `appUserId` registers an account in the same session | New account `appUserId` resolves to the **same** `analyticsUserId` as the prior guest (per [Architecture §5.5](PRODUCT_ANALYTICS_ARCHITECTURE.md#55-sequence-anonymous-use-becoming-an-authenticated-account)) |
| Three redundant guest-bootstrap paths | Simulate `pathselection.js`'s, `guest.trial.js`'s, and `profile.init.js`'s guest-id generation independently converging on different 24-hex ids for what should be one device | Only one `identity_link`/`analyticsUserId` results once the app's own guest-id reconciliation settles on a single id — this is a real risk unique to this app's current client code (three code paths, [Current State §1.5](PRODUCT_ANALYTICS_CURRENT_STATE.md#15-existing-user-identifier-strategy)) and needs explicit coverage, not just trust that the client "usually" converges |

## 2. API-contract tests
| Case | Expected result |
|---|---|
| `POST /api/analytics/events` with a fully valid envelope | `200`, event present in `analytics_events` |
| `POST /api/analytics/events/batch` with 50 valid events | `207`, all `"accepted"` |
| `POST /api/analytics/events/batch` with 51 events | `413` |
| `POST /api/analytics/events/batch` with 1 valid + 1 malformed event | `207`, one `"accepted"`, one `"rejected"` with a specific reason — the valid one is still stored |
| Request with no `Authorization` header | Accepted, `analyticsUserId = null` |
| Request with a valid `Authorization: Bearer` for an existing account | Accepted, `analyticsUserId` resolves correctly |
| Payload over 256 KB | `413` |

## 3. Event-validation tests
Covers the full validation sequence in [API_SPEC.md §4](PRODUCT_ANALYTICS_API_SPEC.md#4-validation-full-sequence) — see §1 above for representative cases; this category additionally verifies **ordering** (e.g., a payload that is both an unknown event name *and* contains a sensitive value should report the event-name rejection first, since there's no point evaluating property content for an event that will be rejected anyway) and that rejections **never** echo the rejected value back in the error response (§5.1 of [API_SPEC.md](PRODUCT_ANALYTICS_API_SPEC.md#51-error-response-shape)).

## 4. Sensitive-field rejection tests
| Input | Expected |
|---|---|
| Email-shaped string in any `properties` value | Rejected |
| Free text > threshold length in an enum-typed property (e.g. `emotionCategory: "I feel like my job is..."`) | Rejected |
| A property key not on that event's allowlist, holding an innocuous value | Stripped (not a full-event rejection — see the allowlist-vs-sensitive-value distinction in [Architecture §7](PRODUCT_ANALYTICS_ARCHITECTURE.md#7-event-validation-allowlisting-and-sensitive-property-rejection)) |
| `appUserId`/raw Mongo `ObjectId` sent as a top-level or property field by a buggy client | Rejected/stripped — must never be persisted into `analytics_events` even if a client mistakenly sends it |

## 5. Deduplication tests
| Case | Expected |
|---|---|
| Same `eventId` sent twice (e.g., client retried a batch it wasn't sure succeeded) | Second attempt is a no-op (`"deduped"`), not a duplicate row, not an error |
| Same logical action, two different `eventId`s (e.g., a genuine double-tap) | Both stored — this is correct; dedup is per `eventId`, not per "action," so a real double-tap is real signal, not something to suppress |
| Client + server both emit `affirmation_requested` for the same request (per [Architecture §6](PRODUCT_ANALYTICS_ARCHITECTURE.md#6-server-generated-vs-client-generated-events)) using a shared `eventId` | Second write deduped, exactly one row results |

## 6. Offline and retry tests
| Case | Expected |
|---|---|
| Device offline for 6 hours, then flushes a queued batch | All events accepted, `occurredAt` (6h old) preserved, `receivedAt` reflects actual ingestion time, no `clockSkewSuspect` flag (within the 24h tolerance) |
| Device offline for 3 days, then flushes | Accepted but flagged `clockSkewSuspect: true`, excluded from default dashboards |
| Guest mode, fully offline session (matches today's real guest-mode behavior per [Current State §1.10](PRODUCT_ANALYTICS_CURRENT_STATE.md#110-existing-affirmation-generation-flow)) | Events queue locally without error, flush successfully once connectivity returns; no user-facing indication of the queued/failed state (per the never-blocks requirement, [Functional Spec §6](PRODUCT_ANALYTICS_FUNCTIONAL_SPEC.md#6-non-functional-requirement-analytics-never-blocks-the-product)) |
| Ingestion endpoint unreachable entirely (network error, not just slow) | Client queues and retries later; **the affirmation flow itself completes normally** — this is the core acceptance test for the non-blocking requirement |

## 7. Out-of-order event tests
| Case | Expected |
|---|---|
| `affirmation_viewed` arrives before `affirmation_generated` for the same logical affirmation (possible under retry/queueing conditions) | Both stored with their own `occurredAt`; reporting logic (funnel, activation) orders by `occurredAt`, not by arrival/`receivedAt` order, so this doesn't corrupt funnel sequencing |
| `session_completed` arrives before `session_started` for the same `anonymousSessionId` (e.g., batch flushed out of internal order) | Both stored; session-duration derivation tolerates this by pairing on `anonymousSessionId` regardless of arrival order |

## 8. Account-deletion tests
| Case | Expected |
|---|---|
| Account with existing `analytics_events` history calls `DELETE /api/account` (real delete) | `identity_link` row for that `appUserId` deleted immediately; `analytics_events` rows for the corresponding `analyticsUserId` remain unchanged |
| After deletion, attempt to resolve `appUserId → analyticsUserId` | No result — resolution fails as expected, confirming the link is actually gone, not just hidden |
| After deletion, query `analytics_user_profiles` for the (now-orphaned) `analyticsUserId` | Row still present (contains no `appUserId` reference) — confirms the "preserve anonymous aggregates" behavior from [Privacy & Security §11](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md#11-account-deletion-handling) |
| `DELETE /api/account?dryRun=1` (preview) | **Must not** delete or affect `identity_link` at all — only the real (non-dry-run) call triggers the analytics-side hook |
| **[BLOCKED]** end-to-end verification against the real deployed `DELETE /api/account` behavior | Cannot be fully executed today — the route doesn't exist in this checkout ([Current State §1.13](PRODUCT_ANALYTICS_CURRENT_STATE.md#113-account-deletion-implementation)); this test can only be written and run once the analytics hook is wired into the actual authoritative backend code, per Phase 1's dependency on backend reconciliation |

## 9. Access-control tests
| Case | Expected |
|---|---|
| Reporting API request without appropriate role/auth | `401`/`403`, no data returned |
| Reporting API request attempting to query `identity_link` directly (e.g., a crafted query param) | Rejected — the reporting API must not expose any code path that touches this collection at all, not just an auth-gated one |
| Reporting API request for a breakdown below the small-cohort threshold | Suppressed/merged into "insufficient data," not returned with an exact small count |
| Direct raw-event query by an engineer (not through the dashboard) | Succeeds only for an authorized role, and is recorded in the audit log per [Privacy & Security §9](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md#9-audit-logging) |
| Anonymous/unauthenticated hit to `/admin/*` (existing routes) | Documented as **currently unprotected** in this checkout ([Current State §1.16](PRODUCT_ANALYTICS_CURRENT_STATE.md#116-any-existing-admin-or-reporting-capability)) — not something this test plan can "pass," but flagged here so the new analytics reporting API is explicitly tested to **not** inherit this gap |

## 10. Aggregation and metric-calculation tests
| Case | Expected |
|---|---|
| Hand-constructed 5-user synthetic dataset with known activation/return pattern | Activation rate, D1/D7 return, and WAU computed by the rollup job match hand-calculated expected values exactly |
| A user who opens the app but performs no meaningful action on day `N+1` | Not counted as D1-returned, even though `app_opened` exists (per the strict [meaningful-return definition](PRODUCT_ANALYTICS_FUNCTIONAL_SPEC.md#2-meaningful-return)) |
| Funnel drop-off calculation across a known synthetic 4-step sequence with a deliberate gap at step 3 | Reported drop-off at step 3 matches the constructed gap exactly |

## 11. Timezone-boundary tests
| Case | Expected |
|---|---|
| User activates at 11:58 PM in their local timezone, returns at 12:03 AM local the same "session" | Correctly bucketed as two different calendar days in **their** timezone, D1-eligible the next day, not conflated into one day |
| Same wall-clock UTC instant, two users in different timezones | Bucketed to potentially different calendar days per user, confirming per-event timezone (not a fixed org timezone) is actually applied — this is the explicit divergence from the existing streak feature's `America/New_York` constant ([Functional Spec §4](PRODUCT_ANALYTICS_FUNCTIONAL_SPEC.md#4-timezone-strategy)) and must be verified, not assumed |
| A user's device timezone changes between two sessions (travel) | Each event bucketed by its own reported timezone; no retroactive reinterpretation of past events |

## 12. Retention-cohort tests (Phase 3+)
| Case | Expected |
|---|---|
| Synthetic cohort of users all activating in the same calendar week | Correctly grouped under one `cohortWeekStart` |
| Cohort retention grid recomputation after a backfill/correction | Existing rows upserted (per the `{cohortWeekStart, weeksSinceActivation}` uniqueness constraint), not duplicated |

## 13. Performance tests
| Case | Expected |
|---|---|
| Batch ingestion of 50 events, repeated at a sustained rate matching the abuse-prevention cap (§8 of [API_SPEC.md](PRODUCT_ANALYTICS_API_SPEC.md#8-rate-limiting-and-abuse-prevention)) | Ingestion route stays responsive; existing product API routes on the same Express process show no measurable latency regression |
| Dashboard query against `daily_product_metrics` for a full year range | Returns promptly (this table is small by design, per [Data Model §4](PRODUCT_ANALYTICS_DATA_MODEL.md#4-daily_product_metrics)) |
| Raw-event query (exception path) against a full 13-month `analytics_events` collection at realistic projected volume | Acceptable latency for an investigative/debugging use case (not held to the same bar as the dashboard's aggregate path, since it's explicitly not the routine access pattern) |

## 14. Dashboard privacy tests
| Case | Expected |
|---|---|
| Dashboard view for a breakdown with a cohort of 5 users | Suppressed per the small-cohort rule, not shown as "5" |
| Dashboard view with no code path reaching `identity_link` | Confirmed via code review/static check, not just runtime testing — the absence of a capability is best verified by inspecting the reporting API's collection access list directly |
| Attempt to export raw `analytics_events` with `analyticsUserId` visible from the dashboard UI (not the audited exception path) | Blocked — dashboards only ever surface aggregates by default |

## 15. Regression tests ensuring analytics failures do not affect the core app
| Case | Expected |
|---|---|
| Analytics ingestion endpoint returns `500` for every request during a full onboarding→activation→rating→New-AI test session | Every product-facing step completes normally and is indistinguishable from a session with healthy analytics, aside from the analytics data itself being absent |
| Analytics ingestion endpoint is entirely unreachable (DNS/connection failure) for the whole session | Same as above — this is the strongest form of the test and should be part of every release's smoke-test pass once analytics ships, alongside the existing Appium smoke scenarios (`appium-smoke.js`'s four scenarios, per [Current State](PRODUCT_ANALYTICS_CURRENT_STATE.md)) |
| Client-side analytics queue/flush code throws an unhandled exception | Caught and swallowed (logged locally at most) without propagating to any UI-facing code path or crashing the app |

---

## Test infrastructure note
Since this repo has no unit-test runner today, adopting one (the specific choice — Jest, Node's built-in `node:test`, etc. — is an implementation detail, not fixed by this document) is itself Phase 1 scope, not an assumed precondition. The existing Appium suite (§14/§15 above) remains the right place for end-to-end, real-device verification that analytics doesn't regress the core product experience — it should gain new scenarios for this purpose rather than being replaced.
