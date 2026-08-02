# Product Analytics — Metrics Specification

Status: **proposal.** All formulas assume the event stream defined in [EVENT_CATALOG.md](PRODUCT_ANALYTICS_EVENT_CATALOG.md) and the identifiers in [ARCHITECTURE.md §5](PRODUCT_ANALYTICS_ARCHITECTURE.md#5-identifier-design). Timezone strategy per [Functional Spec §4](PRODUCT_ANALYTICS_FUNCTIONAL_SPEC.md#4-timezone-strategy): calendar-day boundaries use each event's own client-reported IANA timezone, not a fixed org timezone.

For every metric: **Numerator / Denominator / Eligibility / Window / Timezone / Dedup / Exclusions / Source / Limitations.**

---

## 1. New installations
- **Numerator**: count of distinct `installId` first seen in the window.
- **Denominator**: n/a (raw count).
- **Eligibility**: `installId` present on at least one `app_opened` event.
- **Window**: daily, rolled up.
- **Timezone**: per-event.
- **Dedup**: `installId` uniqueness inherent.
- **Exclusions**: none.
- **Source**: `analytics_events` (`app_opened`).
- **Limitations**: an `installId` is regenerated on reinstall (per [Architecture §5.4](PRODUCT_ANALYTICS_ARCHITECTURE.md#54-identifier-handling-by-scenario)), so this over-counts "new installs" relative to "new humans" for anyone who reinstalls — it measures installs, not unique people, by definition and by name.

## 2. First opens
- **Numerator**: count of `app_opened` events where `coldStart = true` and this is the first such event for the `installId`.
- **Denominator**: n/a.
- **Eligibility/Window/Timezone**: as above.
- **Dedup**: one first-open per `installId`, enforced by only counting the earliest.
- **Exclusions**: none.
- **Source**: `analytics_events`.
- **Limitations**: identical to installs (§1) re: reinstall.

## 3. New account registrations
- **Numerator**: count of `account_created` events in the window.
- **Denominator**: n/a (raw), or ÷ new installations in the same window for a "install→register conversion" variant.
- **Eligibility**: server-confirmed success only (this event is server-generated, per [Event Catalog](PRODUCT_ANALYTICS_EVENT_CATALOG.md#52-authentication-and-account-events)) — never counts a client-side "signup form submitted" as a registration.
- **Window**: daily/weekly.
- **Dedup**: `eventId`.
- **Exclusions**: guest bootstraps are **not** counted here (no `account_created` event fires for guest mode — see [Current State §1.5](PRODUCT_ANALYTICS_CURRENT_STATE.md#15-existing-user-identifier-strategy)).
- **Source**: `analytics_events`.
- **Limitations**: none material.

## 4. Onboarding-start rate
- **Numerator**: distinct `analyticsUserId`/`installId` with `onboarding_started`.
- **Denominator**: distinct `installId` with `app_opened` (first open) in the same window.
- **Eligibility**: as defined.
- **Window**: weekly cohort by first-open date.
- **Dedup**: distinct-id counting handles any repeat `onboarding_started` fires.
- **Exclusions**: a user who already has a valid guest trial or `authToken` on first open skips onboarding entirely (per the app's actual navigation logic in `welcome.js`) and correctly won't have `onboarding_started` — this is expected, not a data gap.
- **Source**: `analytics_events`.
- **Limitations**: none material.

## 5. Onboarding-completion rate
- **Numerator**: distinct ids with `onboarding_completed`.
- **Denominator**: distinct ids with `onboarding_started`, same cohort.
- **Window/Timezone/Dedup**: as above.
- **Exclusions**: none.
- **Source**: `analytics_events`.
- **Limitations**: `firstaffirmation.html`/`.js`'s orphaned onboarding guard (per [Current State](PRODUCT_ANALYTICS_CURRENT_STATE.md#111-existing-onboarding-flow)) is not part of the counted path since it isn't reachable from the live flow — if it's ever re-linked, this metric's step list needs revisiting.

## 6. Activation rate
- **Numerator**: distinct `analyticsUserId` with `activatedAt` set in `analytics_user_profiles` within the window (i.e., both `emotion_selected` and `affirmation_viewed` occurred).
- **Denominator**: distinct `analyticsUserId` first-seen in the same window (or, for a "day-of" activation view, distinct ids with `onboarding_completed` or app-open-without-onboarding in the window).
- **Eligibility rule**: per [Functional Spec §1](PRODUCT_ANALYTICS_FUNCTIONAL_SPEC.md#1-activation) — `emotion_selected` then `affirmation_viewed` for the same `analyticsUserId`, any order of subsequent rate/save/listen/new-AI actions does not affect activation status.
- **Window**: cohort by first-seen week, evaluated at a fixed lookback (e.g., "activated within 7 days of first seen") to keep the metric comparable across cohorts of different ages.
- **Timezone**: per-event for day bucketing; cohort window itself is a rolling day count, not calendar-day-sensitive.
- **Dedup**: `analyticsUserId` already unique per profile.
- **Exclusions**: none.
- **Source**: `analytics_user_profiles` (denormalized) / `analytics_events` (raw, for audit).
- **Limitations**: as discussed in [Functional Spec §1](PRODUCT_ANALYTICS_FUNCTIONAL_SPEC.md#1-activation), `affirmation_viewed` often fires near-simultaneously with `affirmation_generated` today since the UI auto-renders — this metric currently can't distinguish "deliberately viewed" from "auto-rendered," which is a known, accepted simplification, not a bug.

## 7. Time to activation
- **Numerator (per user)**: `activatedAt − firstSeenAt`.
- **Aggregate**: median/p90 across users activated in the window.
- **Eligibility**: only users who did activate; non-activating users are excluded from this metric (they show up in activation *rate*, §6, not in this latency metric).
- **Window**: rolling, by activation date.
- **Timezone**: n/a (duration, not calendar-day-bucketed).
- **Dedup**: n/a.
- **Exclusions**: none.
- **Source**: `analytics_user_profiles`.
- **Limitations**: bucketed, not exact-timestamp, in the underlying event (`timeToGenerateMsBucket` on `affirmation_generated`) is a *different*, narrower latency (generation speed); this metric is the broader "first app open to first viewed affirmation" span and is computed from `firstSeenAt`/`activatedAt`, not from that bucketed property.

## 8. First-session completion
- **Numerator**: distinct `installId` whose first `session_started`…`session_completed` span includes an `affirmation_viewed`.
- **Denominator**: distinct `installId` with a first session at all.
- **Window**: cohort by install date.
- **Dedup**: `session_started`/`session_completed` pairing per `anonymousSessionId`.
- **Exclusions**: none.
- **Source**: `analytics_events`.
- **Limitations**: depends on `session_completed` firing reliably; a crashed app never fires it, so "first session" boundaries are approximated by the next `session_started` in that case (see [Event Catalog §5.1](PRODUCT_ANALYTICS_EVENT_CATALOG.md#51-application-and-session-events)).

## 9. Affirmation-generation success rate
- **Numerator**: count of `affirmation_generated`.
- **Denominator**: count of `affirmation_generated` + `affirmation_generation_failed` (i.e., all resolved attempts).
- **Window**: daily, sliceable by `platform`/`appVersion`/`environment`.
- **Dedup**: `eventId`.
- **Exclusions**: an `affirmation_requested` with no matching resolution event within a reasonable timeout (e.g., request abandoned client-side) is excluded from both numerator and denominator, not counted as a silent failure — it's a distinct "unresolved request" category, reported separately, not folded into a failure rate it can't be confidently attributed to.
- **Source**: `analytics_events`.
- **Limitations**: relies on the server reliably emitting `affirmation_generation_failed` on every failure path in the (currently unverified-locally) deployed affirmation route — **[VERIFY AGAINST DEPLOYED BACKEND]** that every failure branch in the real `/gpt` and `/` handlers gets instrumented, not just the ones visible in this checkout's `routes/affirmations.js`.

## 10. Fallback usage
- **Numerator**: count of `affirmation_generated` where `source = "db"` or `"local_fallback"`.
- **Denominator**: count of all `affirmation_generated`.
- **Window/Dedup**: as above.
- **Exclusions**: none.
- **Source**: `analytics_events`.
- **Limitations**: guest-mode's local library reuse (per [Current State §1.10](PRODUCT_ANALYTICS_CURRENT_STATE.md#110-existing-affirmation-generation-flow)) means `local_fallback` is expected to be common and normal for guests, not necessarily a sign of upstream trouble — this metric should always be sliced by guest-vs-account (or at minimum, `isGuest` should be an available dimension) to avoid misreading guest behavior as reliability degradation.

## 11. Generation-failure rate
Same as the complement of §9 — `affirmation_generation_failed ÷ (generated + failed)` — sliceable by `failureCategory`, `platform`, `appVersion` to answer "which app versions or platforms experience generation failures" directly from the brief.

## 12. Rating participation
- **Numerator**: distinct `analyticsUserId` with ≥1 `affirmation_rated` in the window.
- **Denominator**: distinct `analyticsUserId` with ≥1 `affirmation_viewed` in the window.
- **Exclusions**: guests are structurally excluded from the numerator (stars are hidden for guests today, per [Current State](PRODUCT_ANALYTICS_CURRENT_STATE.md#112-existing-rating-saving-listening-insight-and-new-ai-flows)) — this metric should be reported for account users only, or guests should be explicitly carved out of the denominator too, to avoid an artificially depressed participation rate that's really just "guests can't rate."
- **Source**: `analytics_events`.

## 13. Save rate
Pending the open product decision in [Event Catalog §5.4](PRODUCT_ANALYTICS_EVENT_CATALOG.md#54-core-affirmation-journey) on whether `affirmation_saved` is even emitted as distinct from `affirmation_generated` — if not adopted, this metric is not computable and should be reported as "not available" rather than silently defaulting to 100%.

## 14. Listen rate
- **Numerator**: distinct `analyticsUserId` with ≥1 `affirmation_listened`.
- **Denominator**: distinct `analyticsUserId` with ≥1 `affirmation_viewed`, same window.
- **Source**: `analytics_events`. **Limitations**: this is **entirely new instrumentation** (Listen has zero server visibility today) — until it ships, this metric has no historical baseline at all, unlike rating (which at least has the existing `affirmations.rating` field as a rough proxy).

## 15. New AI request rate
- **Numerator**: count of `new_ai_requested`.
- **Denominator**: distinct `analyticsUserId` active in the window (for a per-user rate) or count of `affirmation_viewed` (for a per-view rate) — report both, they answer different questions.
- **Limitations**: the existing client-enforced daily quota (3/day guest, 10/day account, per [Current State](PRODUCT_ANALYTICS_CURRENT_STATE.md#112-existing-rating-saving-listening-insight-and-new-ai-flows)) caps this metric's ceiling per user per day — a rate consistently pinned at the quota ceiling for many users is itself a signal worth flagging (possible demand for a higher quota), not just a raw usage number.

## 16. Meaningful engagement rate
- **Numerator**: distinct `analyticsUserId` performing any meaningful action (§2 of [Functional Spec](PRODUCT_ANALYTICS_FUNCTIONAL_SPEC.md#2-meaningful-return)) in the window.
- **Denominator**: distinct `analyticsUserId` active (any event) in the window.
- **Source**: `analytics_events`.

## 17. Day-1 / Day-7 / Day-30 return
- **Numerator**: distinct `analyticsUserId` with `activatedAt` on day `N` **and** a meaningful action on day `N+1` (`N+7`, `N+30`) in their own local timezone.
- **Denominator**: distinct `analyticsUserId` with `activatedAt` on day `N`.
- **Eligibility**: only previously-activated users are eligible at all (per [Functional Spec §2](PRODUCT_ANALYTICS_FUNCTIONAL_SPEC.md#2-meaningful-return)) — an app open with no meaningful action never counts, even on the target day.
- **Window**: exact day `N+k`, not "any day up to and including" (see [Functional Spec §3](PRODUCT_ANALYTICS_FUNCTIONAL_SPEC.md#3-retention-windows)).
- **Timezone**: the user's own reported timezone at the time of each event — **deliberately different** from the existing streak feature's fixed `America/New_York` boundary (flagged as an open decision, see [Decisions](PRODUCT_ANALYTICS_DECISIONS_AND_RISKS.md)).
- **Dedup**: `analyticsUserId` uniqueness.
- **Exclusions**: none beyond the activation-eligibility rule.
- **Source**: `analytics_user_profiles` + `analytics_events`.
- **Limitations**: a user who changes device timezone between activation and the return day is bucketed using each event's own timezone, which is the more correct but occasionally counter-intuitive behavior for a traveling user (see [Functional Spec §4](PRODUCT_ANALYTICS_FUNCTIONAL_SPEC.md#4-timezone-strategy)).

## 18. Weekly / Monthly active users (WAU/MAU)
- **Numerator**: distinct `analyticsUserId` with ≥1 meaningful action in the trailing 7 (30) days.
- **Denominator**: n/a (raw count), or ÷ total known `analyticsUserId`s ever activated for a "% of activated base still active" variant.
- **Window**: trailing, recomputed daily.
- **Source**: `analytics_events`.

## 19. Average active days per user
- **Numerator**: sum of distinct active calendar days across users in the cohort.
- **Denominator**: count of users in the cohort.
- **Source**: `analytics_user_profiles.activeDayCount`, scoped to the cohort's window.

## 20. Sessions per activated user
- **Numerator**: count of `session_started` for activated users.
- **Denominator**: count of distinct activated `analyticsUserId`s.
- **Window**: matches the reporting period.
- **Limitations**: depends on the session-timeout threshold decision (an unresolved product decision, see [Decisions](PRODUCT_ANALYTICS_DECISIONS_AND_RISKS.md)) — a shorter timeout inflates session count for the same real-world usage pattern, so this metric is only meaningful compared against itself over time with a fixed threshold, not compared against another product's session count.

## 21. Feature adoption
- **Numerator**: distinct `analyticsUserId` using a given feature (rate/save/listen/new-AI/insight-view) at least once in the window.
- **Denominator**: distinct `analyticsUserId` active in the window.
- **Source**: `analytics_events`, one row per feature.

## 22. Funnel drop-off by step
- **Numerator/Denominator**: per consecutive step pair in the ordered funnel milestone events (marked "Yes" in the Event Catalog's funnel-milestone column), count reaching step `k+1` ÷ count reaching step `k`.
- **Window**: cohort by entry into step 1 (typically `onboarding_started` or `app_opened` for already-onboarded users).
- **Source**: `analytics_events`.
- **Limitations**: this is a strict, ordered-step funnel; the app's actual navigation (e.g., users who already have a valid guest trial skip onboarding entirely) means the funnel's "step 1" population is itself a defined subset, not literally "everyone," and reports should state which entry population a given funnel view uses.

## 23. Retention by acquisition source
Only computable once [attribution](PRODUCT_ANALYTICS_ARCHITECTURE.md#11-attribution-architecture) (Phase 3) exists; formula is D1/D7/D30 (§17) segmented by `campaign_attribution.confidence = "confirmed"` records only by default, with "probable"-confidence segments shown separately and clearly labeled, never blended into the confirmed number.

## 24. App-version and platform comparisons
Any metric above, sliced by `appVersion`/`buildNumber`/`platform` dimensions on `daily_product_metrics` — subject to the small-cohort suppression rule ([Privacy & Security §7](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md#7-admin-dashboard-aggregation-thresholds-small-cohort-suppression)) for any version/platform combination with few users.
