# Product Analytics — Privacy, Security & Governance

Status: **proposal.** This document does not constitute legal advice; items requiring legal/privacy counsel review are marked **[LEGAL REVIEW NEEDED]** throughout and summarized in §12.

---

## 1. Data classification

| Class | Definition | Examples in this design | Handling |
|---|---|---|---|
| **A — Behavioral, no sensitivity** | Records an action with no wellbeing-adjacent content | `app_opened`, `session_started`, `login_succeeded`, `account_created` | Standard analytics access controls |
| **B — Behavioral, sensitive-adjacent** | Records an action whose *category* (not content) touches emotional/wellbeing information | `emotion_selected` (broad category only), `affirmation_viewed`, `affirmation_rated`, `insight_viewed` | Same access controls as Class A **plus** the small-cohort suppression rule (§7) and the emotion-category-specific treatment in §11 |
| **Linkage** | Connects an analytics identity to a real app user | `identity_link` only | Most restrictive access tier in the whole system (§4) |
| **Private content** (existing, unchanged) | `users`, `affirmations`, `emotionlogs`, `reflections` | Governed by existing app security practice, out of scope for this analytics design except as the thing analytics must never copy from |

No event in this design is Class C ("directly identifying") by construction — the allowlist and sensitive-value rejection in [Event Catalog](PRODUCT_ANALYTICS_EVENT_CATALOG.md) and [API Spec](PRODUCT_ANALYTICS_API_SPEC.md) are what keep it that way; this classification table only holds if those controls are actually implemented and kept in sync as events are added later.

---

## 2. Data minimization

- Every event property must appear in the per-event allowlist in [Event Catalog](PRODUCT_ANALYTICS_EVENT_CATALOG.md#5-full-event-catalog) before it can be collected — additions require updating that document, not just shipping a client change.
- Broad emotion categories (fixed enum, §3 of the Event Catalog) replace the existing app's free-text `emotionlogs.emotion` field for analytics purposes; the free-text field itself is unchanged and out of scope (it remains part of the app's private-content data, governed separately).
- No device serial numbers, advertising identifiers, or exact GPS coordinates are ever collected — `installId` is a random, app-generated UUID, explicitly **not** derived from IDFA/GAID/IMEI (see [Architecture §5.2](PRODUCT_ANALYTICS_ARCHITECTURE.md#52-why-not-derive-analyticsuserid-from-the-existing-app-user-id-directly) for the parallel reasoning applied to `analyticsUserId`).

## 3. Purpose limitation

Analytics data collected under this design exists to answer the product questions listed in the brief (usage, funnel, retention, feature adoption, reliability by version/platform, acquisition-to-activation linkage) — it is not to be repurposed for individualized user profiling, targeted intervention on specific users, or any use beyond aggregate product measurement without a new, explicit privacy review. This purpose statement should be reflected in the privacy policy update flagged in §11.

## 4. Access controls

| Data | Who can access | How |
|---|---|---|
| `analytics_events`, `analytics_user_profiles`, `daily_product_metrics`, `retention_cohorts` | Product/founder roles via the reporting API/dashboard | Read-only reporting API, aggregated views by default (§7) |
| `identity_link` | **No one** via any reporting/dashboard surface. A narrow, named set of engineers for account-deletion processing and abuse investigation only | Direct, audited DB access or a purpose-built internal tool — never exposed as a general query endpoint |
| Raw `analytics_events` row-level access (not aggregated) | Engineers debugging a specific reported issue | Time-boxed, logged access; not a standing dashboard feature |
| `growth_campaigns`/`campaign_attribution` (Phase 3) | Marketing/growth role | Separate from the analytics reporting API, since it may contain named-outreach information |

This mirrors and tightens the existing app's current admin surface, which today (`routes/admin.js`) has **no authentication at all** on `/admin/users`, `/admin/emotions`, `/admin/affirmations` — the new analytics reporting API must not repeat that pattern; it needs its own auth check from day one, not "the same as `/admin` for now, harden later."

## 5. Encryption expectations

- In transit: all ingestion and reporting traffic over TLS — no different from what should already be true for the rest of `/api` (today's DEV environment notably runs the *existing* app over plain HTTP to one whitelisted IP per an iOS ATS exception; that's a pre-existing DEV-only condition this design doesn't change or excuse, but the analytics endpoint should not be used as a reason to add further ATS exceptions).
- At rest: relies on the same MongoDB deployment's at-rest protections as every other collection in `affirmationsDB` — no new encryption requirement is introduced by this design beyond what the `identity_link` collection's sensitivity (§4) argues for extra care around (e.g., ensure it isn't included in any broad, less-access-controlled database export/backup process without the same restrictions carried along).

## 6. Separation between user identity and analytics

This is the design's central invariant, implemented via `identity_link` (see [Data Model](PRODUCT_ANALYTICS_DATA_MODEL.md#2-identity_link)) — restated here as a governance rule, not just a schema detail: **no analytics event ever stores `appUserId` directly**, and the one table that connects the two is access-controlled per §4. Any future feature request to "just add the user's account id to the event for convenience" must be rejected or routed through a fresh privacy review, since it would silently reintroduce exactly the risk this design exists to avoid.

## 7. Admin-dashboard aggregation thresholds (small-cohort suppression)

**[PRODUCT DECISION NEEDED]** — proposed default: any dashboard breakdown (e.g., "D7 return by emotion category, by app version") that would show a cohort smaller than **20 distinct `analyticsUserId`s** is suppressed or merged into an "other/insufficient data" bucket rather than displayed with an exact count. Rationale: at this app's current scale, a narrow breakdown (e.g., one emotion category × one rare app version × one platform) could shrink to a handful of people, and combined with an admin's own knowledge of who's using the app, could become re-identifying even without any name ever being stored. The exact threshold is a product/privacy decision, not a technical constant — 20 is a reasonable starting point pending review, tracked in [Decisions](PRODUCT_ANALYTICS_DECISIONS_AND_RISKS.md).

## 8. Raw-event access restrictions

Restated from §4 for emphasis: raw, row-level `analytics_events` access (as opposed to aggregated `daily_product_metrics`) should be an exception-path capability for debugging, not a routine dashboard feature — every raw-event query should be logged (§9) precisely because it's the one place in the reporting layer where enough context (timestamps, sequences, properties) could, in combination with external knowledge, narrow down to an individual, even without a name field ever being present.

## 9. Audit logging

- Every access to `identity_link` (§4) is logged: who, when, which `appUserId`/`analyticsUserId`, and why (e.g., "account deletion processing for request #123").
- Every raw-event (non-aggregated) reporting query is logged similarly.
- Aggregated dashboard/report views (the normal path) do not need per-view audit logging beyond standard application access logs — the sensitivity concentrates in the two paths above, and over-logging routine aggregate views adds noise without adding safety.

## 10. Data retention periods

| Data | Retention | Rationale |
|---|---|---|
| Raw `analytics_events` | 13 months, then archived/dropped | Long enough for year-over-year comparison, short enough to bound exposure and storage growth ([Data Model §1](PRODUCT_ANALYTICS_DATA_MODEL.md#1-analytics_events)) |
| `identity_link` | Life of the app identity; deleted immediately on account deletion | The whole point of the table is to be deletable independently of the events it once resolved |
| `analytics_user_profiles` | Same order as raw events; not deleted on account deletion since it holds no direct app-identity reference | See [Data Model §3](PRODUCT_ANALYTICS_DATA_MODEL.md#3-analytics_user_profiles) |
| `daily_product_metrics` / `retention_cohorts` | Indefinite (aggregate-only, negligible re-identification risk) | These are exactly the safe-to-keep-forever layer |
| `growth_campaigns` / `campaign_attribution` (Phase 3) | Per a separate retention policy, since these may include named-outreach data outside analytics' scope | **[LEGAL REVIEW NEEDED]** if any named third-party data (e.g., an ad platform's campaign metadata) is retained here |

## 11. Account-deletion handling

On a real (non-dry-run) `DELETE /api/account` success:
1. `identity_link` row(s) for that `appUserId` are deleted immediately — this is the only mandatory, automatic action analytics takes in response to account deletion.
2. Historical `analytics_events` rows already written under the now-orphaned `analyticsUserId` are **not** deleted — they contain no direct identity reference by construction, so they remain as anonymous aggregate-eligible history, consistent with "preserving only genuinely anonymous aggregate metrics where appropriate" from the brief.
3. **[OPEN QUESTION / VERIFY AGAINST DEPLOYED BACKEND]**: this design cannot currently confirm what `DELETE /api/account` actually does server-side (hard vs. soft delete of `users`/`affirmations`/`emotionlogs`/`reflections` — see [Current State §1.13](PRODUCT_ANALYTICS_CURRENT_STATE.md#113-account-deletion-implementation)), so the analytics-side hook described above must be wired into whatever the *real* deletion code path is (not `routes/clear.js`'s `DELETE /clearall`, which is a separate dev/test utility per that section) once the authoritative backend repo is available for reference.
4. **[LEGAL REVIEW NEEDED]**: whether retaining anonymized behavioral aggregates post-deletion is consistent with the app's privacy policy commitments and applicable law (e.g., if a user requested deletion under a "right to erasure"-style request, does an anonymous-but-technically-derived-from-their-usage aggregate count as "their data" for that purpose?) — this is a legal question, not a technical one, and is flagged rather than answered here.

## 12. Analytics opt-out considerations

**[PRODUCT DECISION NEEDED]** — this design does not assume an opt-out is required (the events proposed are aggregate product-usage signals, arguably closer to "service analytics" than "marketing tracking"), but given the wellbeing/emotional nature of the app, recommend product + legal jointly decide whether:
- A visible, in-app analytics opt-out is offered (distinct from any OS-level "ask app not to track" prompt, which today's app doesn't trigger since no advertising identifier is ever used), and
- If offered, what "opted out" means functionally — no events sent at all, vs. events sent but excluded from any per-user-timeline view, vs. only aggregate-eligible with no individual timeline ever constructed regardless of opt-out state (which, given this design's aggregation-first reporting posture, is close to true by default already).

## 13. Privacy-policy implications

**[LEGAL REVIEW NEEDED]**: the app's current privacy policy (not reviewed as part of this repository analysis — out of scope, it's not a code artifact) should be checked for whether it already covers "aggregated, de-identified usage analytics" or needs an update once this system ships. This is explicitly a legal/policy task, not something this document can resolve.

## 14. Incident-response considerations

- If `identity_link` access controls are ever found to have been bypassed or misconfigured (§4), treat it as a data-breach-class incident (it's the one place identity and behavior are joined), not a routine bug — this should be written into whatever incident-response runbook the team maintains, given none is documented in this repo today (`docs/qa/release-checklist-rls-003.md`'s "Sentry / APM" gap in [Current State](PRODUCT_ANALYTICS_CURRENT_STATE.md#18-existing-logging-or-analytics) means there's currently no monitoring that would even surface such an incident quickly — this is itself a dependency worth raising, not assuming away).
- If a client bug is found to have shipped a disallowed property value that slipped past validation (e.g., a new event accidentally including free text), the remediation is: fix the validator/allowlist, and separately assess whether already-ingested events need to be purged of the leaked field — a targeted field-level purge, not a wholesale collection wipe.

## 15. Risks of small cohorts enabling re-identification

Covered functionally in §7; restated as a named risk because it's easy to under-weight at a small startup's current scale, where "20 users on this app version" might genuinely be close to the *entire* population using that version — meaning even an aggregate number, without any cohort-size suppression, can amount to near-individual visibility. This is one of the more likely real privacy risks in this whole design given the app's current size, more so than any single field-level leak, and should be treated as such in review priority.

## 16. Should free-text analytics properties be prohibited globally?

**Yes, without exception**, per this design (§2 of [Event Catalog](PRODUCT_ANALYTICS_EVENT_CATALOG.md#2-globally-prohibited-properties-apply-to-every-event-no-exceptions)) — there is no proposed event in this catalog that accepts free text, and the sensitive-value pattern rejection in ingestion exists specifically as a backstop against this rule being violated by a future event addition that didn't go through proper review.

## 17. Do emotion categories require special treatment because they may reflect sensitive wellbeing information?

Yes — this is why emotion-related events are classified **Class B** (§1), not Class A, even though they only ever carry a fixed broad category, never free text. Practically, Class B status means: the small-cohort suppression rule (§7) applies with particular care to any breakdown that includes `emotionCategory` as a dimension, and any future decision to make emotion-category data available beyond aggregate dashboards (e.g., an individual pseudonymous timeline view for a support/research purpose) should get its own dedicated privacy review rather than being treated as "just another dimension" — flagged in [Decisions](PRODUCT_ANALYTICS_DECISIONS_AND_RISKS.md) as an open question (should administrators ever see individual pseudonymous journeys, including emotion-category sequences?).
