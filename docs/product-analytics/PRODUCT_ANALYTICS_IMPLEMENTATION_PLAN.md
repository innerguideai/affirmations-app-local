# Product Analytics — Implementation Options & Phased Delivery Plan

Status: **proposal — planning only, nothing implemented.** No time estimates are given anywhere in this document beyond T-shirt sizes, per the brief's instruction not to estimate time without repository-grounded support for it.

---

## Part 1 — Implementation options

### Option A — Minimal server analytics (on the existing stack)

**Architecture**: reuse `server.js`'s existing Express app and MongoDB connection exactly as-is. Add one route file (`routes/analytics.js`, following the exact factory pattern every other route already uses — `module.exports = function(db) {...}`), one new collection (`analytics_events`), on-demand aggregation queries (no scheduled job) for the small number of metrics needed first.

- **Benefits**: zero new infrastructure, zero new operational surface, fits the existing single-process/single-Mongo-instance deployment exactly, fastest to build, easiest to reason about given how small this app's current scale is.
- **Risks**: on-demand aggregation over a growing `analytics_events` collection will slow down as data accumulates, since there's no rollup layer yet; the shared Express process now does double duty (product traffic + analytics ingestion), so a spike in one could theoretically affect the other without careful rate limiting (§8 of [API_SPEC.md](PRODUCT_ANALYTICS_API_SPEC.md)).
- **Privacy implications**: identical to the full design ([Privacy & Security](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md)) — the privacy model doesn't change with the implementation option, only the infrastructure does.
- **Engineering effort**: Small–Medium. One new route file, one new collection, client instrumentation work (the bulk of the effort, since zero client analytics code exists today).
- **Operational effort**: Low — no new process to run, monitor, or deploy; rides along with the existing (already fragile, not-PM2-managed, per [Current State §1.15](PRODUCT_ANALYTICS_CURRENT_STATE.md#115-deployment-architecture-relevant-to-analytics)) main app server.
- **Cost**: Effectively free beyond existing infrastructure and OpenAI-unrelated Mongo storage growth.
- **Scalability**: Adequate for the app's current and near-term scale (per [Data Model §1](PRODUCT_ANALYTICS_DATA_MODEL.md#1-analytics_events), a low-tens-of-thousands-of-events-per-day volume); would need to graduate to Option B before hitting real strain.
- **Vendor dependency**: none.
- **Recommendation**: **adopt for Phase 1.** This is the right starting point given the app's actual current scale and the fact that the main app server isn't even PM2-managed yet — adding a queue or a second service before the basics work would be solving a scale problem the app doesn't have.

### Option B — Expanded internal analytics platform

**Architecture**: everything in Option A, plus a scheduled daily-rollup job (writing `daily_product_metrics`), an internal reporting API distinct from the ingestion route, and — once volume genuinely warrants it — asynchronous ingestion (e.g., write to a lightweight queue or a Mongo "inbox" collection first, process in a worker, rather than synchronously validating and writing on the request thread).

- **Benefits**: dashboards/weekly reports stay fast regardless of raw-event volume; ingestion latency stays low even under load since heavy validation/enrichment can move off the request thread if needed; clean separation between "ingest" and "report" lets access controls (§4 of [Privacy & Security](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md)) be enforced at a natural boundary.
- **Risks**: more moving parts to operate correctly (a rollup job that silently stops running produces stale dashboards that look fine at a glance); introduces the first genuinely new operational surface this app has had (no queue/cron infrastructure exists today per [Current State §1.15](PRODUCT_ANALYTICS_CURRENT_STATE.md#115-deployment-architecture-relevant-to-analytics)).
- **Privacy implications**: same model as Option A; the added reporting API is the natural enforcement point for the aggregation-only default (§7 of [Privacy & Security](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md)).
- **Engineering effort**: Medium–Large — rollup job design, reporting API, dashboard UI.
- **Operational effort**: Medium — a new scheduled job needs monitoring (did it run? did it fail silently?), which is new muscle for a team whose current backend isn't even process-supervised.
- **Cost**: still effectively free at this scale (compute for a daily rollup job is trivial); mainly an engineering-time investment, not a spend decision.
- **Scalability**: comfortably ahead of this app's foreseeable growth for a long time.
- **Vendor dependency**: none.
- **Recommendation**: **Phase 2 target**, once Phase 1's event stream exists and dashboards start to need the rollup layer to stay responsive — not a Phase 1 requirement.

### Option C — External analytics platform

**Architecture**: send events to a third-party product-analytics vendor (e.g., a self-hosted or EU-hosted privacy-conscious platform such as PostHog, or a hosted alternative) instead of, or in addition to, the internal store.

- **Benefits**: mature dashboarding, funnel/cohort UI, and SDKs out of the box — the biggest time-saver of the three options for reporting-surface work specifically.
- **Risks / privacy implications**: this app's core content is **emotional-wellness data** — even with the strict "no emotion text, category-only" rule in this design, sending *any* wellbeing-adjacent behavioral signal to a third party requires: confirming the vendor's **data residency** (where events are physically stored, relevant if any future regulatory regime constrains wellness-data location), reviewing their **SDK's own data collection** (a third-party SDK embedded in the app may itself collect device signals beyond what this design intends to send — this must be audited, not assumed benign, especially since the app's Podfile/build.gradle currently has zero such SDKs per [Current State §1.8](PRODUCT_ANALYTICS_CURRENT_STATE.md#18-existing-logging-or-analytics)), their **pricing** at scale, and whether their standard terms allow the kind of strict allowlisting/rejection this design requires (some vendor SDKs auto-capture UI interactions broadly by default, which would need to be disabled, not just "mostly avoided").
- **Engineering effort**: Small for basic integration, Medium–Large if a self-hosted deployment is chosen (new infrastructure to run) or if strict event-shape control requires disabling/reconfiguring the vendor SDK's defaults.
- **Operational effort**: Low if hosted by the vendor; Medium if self-hosted.
- **Cost**: real, ongoing, usage-based spend — the first genuine dollar cost in this whole design.
- **Scalability**: excellent — this is what these platforms are built for.
- **Vendor dependency**: real and worth naming plainly — event taxonomy, identifier design, and reporting all become coupled to the vendor's data model and pricing tiers, and migrating away later is nontrivial.
- **Recommendation**: **do not adopt for Phase 1 or 2.** Given the sensitivity of emotional-wellness data and this app's current scale (where Option A/B fully cover the need), introducing a third party is not justified yet. Revisit only if/when: reporting needs genuinely outgrow what an internal dashboard can reasonably provide, **and** a specific vendor has been vetted for data residency, SDK behavior, and contractual terms suitable for wellness-adjacent data — this should be its own follow-up evaluation, not a default upgrade path.

---

## Part 2 — Phased delivery plan

### Phase 0 — Decisions and privacy review
**Scope**: finalize event taxonomy (confirm the [Event Catalog](PRODUCT_ANALYTICS_EVENT_CATALOG.md) as proposed or amend), finalize activation/return definitions ([Functional Spec](PRODUCT_ANALYTICS_FUNCTIONAL_SPEC.md)), approve the prohibited-data rules ([Privacy & Security](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md)), confirm retention and account-deletion policy, review privacy-policy impact, resolve the emotion-category enum ([Event Catalog §3](PRODUCT_ANALYTICS_EVENT_CATALOG.md#3-broad-emotion-category-enum)) and the small-cohort suppression threshold ([Privacy & Security §7](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md#7-admin-dashboard-aggregation-thresholds-small-cohort-suppression)).
**Dependencies**: none — this can start immediately.
**Technical work**: none (this is a decisions-and-review phase).
**Product decisions**: activation/return definition sign-off, timezone-strategy sign-off (given the deliberate divergence from the existing streak feature's fixed timezone — [Functional Spec §4](PRODUCT_ANALYTICS_FUNCTIONAL_SPEC.md#4-timezone-strategy)), emotion-category enum, session-timeout threshold, small-cohort suppression threshold, `affirmation_saved` event decision.
**Privacy review**: full review of this doc set, especially [Privacy & Security](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md)'s **[LEGAL REVIEW NEEDED]** items.
**Testing**: n/a.
**Acceptance criteria**: written, dated sign-off on the above decisions.
**Risks**: proceeding to Phase 1 without this sign-off risks building against definitions that get revised later, wasting Phase 1 engineering effort.
**Complexity**: **S**.

### Phase 1 — Minimum viable measurement
**Scope**: the smallest event set needed to measure the core journey — `app_opened`, `onboarding_completed`, `emotion_selected`, `affirmation_generated`, `affirmation_generation_failed`, `affirmation_viewed`, `affirmation_rated`, `new_ai_requested`, `session_completed` (per the brief's suggested initial list), plus `appVersion`/`platform`/`environment` capture (new — not present in the app at all today, per [Current State §1.9](PRODUCT_ANALYTICS_CURRENT_STATE.md#19-existing-app-version-and-platform-information)).
**Dependencies**: Phase 0 sign-off; **reconciliation with the authoritative backend repo** (`affirmations-app-server`) before writing any server-side event emission, given this checkout's backend cannot be trusted as-is (see [Current State §0](PRODUCT_ANALYTICS_CURRENT_STATE.md#0-a-load-bearing-caveat-this-checkout-is-not-reliable-ground-truth-for-the-backend)).
**Technical work**: Option A architecture — new `routes/analytics.js` + `analytics_events`/`identity_link` collections; client-side event queue + flush wired into `capacitor.entry.js`/`profile.api.js`'s existing `apiFetch` pattern; wire up `App.getInfo()` (bundled, unused today) for version/platform capture; instrument the 9 events above at their actual trigger points identified in [Current State §2](PRODUCT_ANALYTICS_CURRENT_STATE.md#2-current-journey-mapping).
**Product decisions**: none beyond Phase 0's.
**Privacy review**: confirm the shipped event set matches exactly what Phase 0 approved, no scope creep.
**Testing**: full [Test Plan](PRODUCT_ANALYTICS_TEST_PLAN.md) §§1–5 (validation, sensitive-field rejection, dedup, offline/retry, account-deletion linkage).
**Acceptance criteria**: all 9 events observable in `analytics_events` for a real end-to-end test session on both iOS and Android; analytics-disabled smoke test confirms zero impact on the core affirmation flow ([Functional Spec §6](PRODUCT_ANALYTICS_FUNCTIONAL_SPEC.md#6-non-functional-requirement-analytics-never-blocks-the-product)).
**Risks**: the three redundant guest-bootstrap code paths ([Current State §1.5](PRODUCT_ANALYTICS_CURRENT_STATE.md#15-existing-user-identifier-strategy)) could each trigger identity-resolution logic if not handled carefully, risking duplicate `identity_link` rows for what should be one guest identity — needs explicit test coverage (see [Test Plan](PRODUCT_ANALYTICS_TEST_PLAN.md)).
**Complexity**: **L** (mostly because zero client analytics code exists today — every instrumentation call site is new, not modified).

### Phase 2 — Retention and feature adoption
**Scope**: return measurement (D1/D7/D30, WAU/MAU), save/listen instrumentation, insight-viewed instrumentation, cohort calculations, version/platform comparison views; graduate to Option B's rollup job + reporting API.
**Dependencies**: Phase 1's event stream must have run long enough to produce a meaningful D7/D30 baseline before those specific metrics are useful (not a hard technical dependency, but a "the numbers won't mean much sooner" reality).
**Technical work**: `analytics_user_profiles` collection + upsert logic; daily rollup job populating `daily_product_metrics`; internal reporting API; basic admin dashboard.
**Product decisions**: `affirmation_saved` event adoption decision (deferred from Phase 0/1, [Event Catalog §5.4](PRODUCT_ANALYTICS_EVENT_CATALOG.md#54-core-affirmation-journey)); dashboard aggregation-threshold sign-off if not finalized in Phase 0.
**Privacy review**: confirm the reporting API enforces small-cohort suppression and never exposes `identity_link`.
**Testing**: [Test Plan](PRODUCT_ANALYTICS_TEST_PLAN.md) §§6–9 (aggregation/metric correctness, timezone boundaries, cohort tests, dashboard privacy tests).
**Acceptance criteria**: D1 return rate computable and spot-checked by hand against a small known test cohort; dashboard never renders a cohort below the suppression threshold.
**Risks**: rollup-job correctness drift from ad-hoc query logic if both are used interchangeably ([Data Model §4](PRODUCT_ANALYTICS_DATA_MODEL.md#4-daily_product_metrics)'s risk note) — mitigate by treating `daily_product_metrics` as the only source dashboards trust.
**Complexity**: **M**.

### Phase 3 — Acquisition attribution
**Scope**: campaign links, referral codes, campaign-to-activation reporting, "how did you hear about us?" supplemental question, `growth_campaigns`/`campaign_attribution` collections.
**Dependencies**: Phase 2's activation/return metrics, since attribution reporting is "retention by acquisition source" layered on top of those.
**Technical work**: tracked-link generation, referral-code redemption flow (none exists today — new UI + backend work), attribution-confidence classification logic.
**Product decisions**: which acquisition channels to support first; whether a paid App Store attribution tool is worth adopting given Apple's platform limitations ([Architecture §11](PRODUCT_ANALYTICS_ARCHITECTURE.md#11-attribution-architecture)).
**Privacy review**: confirm `growth_campaigns`/`campaign_attribution` stay structurally separate from `analytics_events`, per [Data Model §6](PRODUCT_ANALYTICS_DATA_MODEL.md#6-growth_campaigns-and-campaign_attribution-phase-3).
**Testing**: attribution-confidence classification tests (confirmed vs. probable never blended in reporting).
**Acceptance criteria**: a test referral code correctly produces a "confirmed" attribution record end-to-end.
**Risks**: overclaiming attribution certainty — the single biggest risk named explicitly in [Architecture §11](PRODUCT_ANALYTICS_ARCHITECTURE.md#11-attribution-architecture); must not ship a dashboard that blurs "probable" into "confirmed."
**Complexity**: **L**.

### Phase 4 — Automated insights
**Scope**: weekly founder report, trend detection, anomaly detection, evidence-backed insight generation per the fact/comparison/correlation/hypothesis/recommendation discipline in [Functional Spec §7](PRODUCT_ANALYTICS_FUNCTIONAL_SPEC.md#7-insights-agent-behavior-phase-4--functional-rules).
**Dependencies**: Phases 1–3's data must exist and be trustworthy — an insights agent built on top of unreliable rollups will just automate bad conclusions faster.
**Technical work**: the insights agent itself (reads only aggregated tables, never raw identity-linked data, per [Architecture §9](PRODUCT_ANALYTICS_ARCHITECTURE.md#9-reporting-and-insights-architecture)); report templating.
**Product decisions**: how much autonomy the agent has (draft-for-review vs. auto-published); which recipients get the weekly report.
**Privacy review**: confirm the agent's output never surfaces individual pseudonymous journeys (ties to the open question in [Decisions](PRODUCT_ANALYTICS_DECISIONS_AND_RISKS.md) on whether admins should ever see those at all).
**Testing**: correctness of the fact/correlation/hypothesis labeling on a set of known synthetic scenarios.
**Acceptance criteria**: a full week's automated report reviewed by a human and confirmed not to overstate any finding as causal.
**Risks**: the single biggest risk is the agent (or a human editing its output) presenting a correlation as causation, explicitly the failure mode [Functional Spec §7](PRODUCT_ANALYTICS_FUNCTIONAL_SPEC.md#7-insights-agent-behavior-phase-4--functional-rules) is designed to prevent.
**Complexity**: **XL**.
