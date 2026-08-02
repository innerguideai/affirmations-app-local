# Product Analytics — Executive Summary

Status: **analysis and design proposal only. No application code, database, or configuration was changed to produce this document set.**

---

## What can be measured today

Almost nothing, from an analytics standpoint. The app has real, working features — onboarding, emotion selection, context questions, AI/database affirmations, rating, a daily streak, an emotion dashboard — but **no product-analytics instrumentation exists anywhere** in the client or backend. There is no analytics SDK in the app (confirmed by checking every dependency file), no events table in the database, and no dashboard beyond a few unauthenticated raw-data-dump admin endpoints. The only things closest to "measurement" today are: the existing emotion log (free-text, stored for a different purpose), the star-rating field on affirmations, and a client-only daily streak counter that never reaches the server.

## What cannot be measured today

Everything the business actually wants to know: how many people open the app, how many are new vs. returning, how many complete onboarding, where people drop off, how long it takes to get to a first affirmation, whether people come back the next day/week/month, which features (rating, saving, listening, requesting a new AI affirmation) people actually use, and whether app version or platform affects reliability. None of this is observable in the app as it exists right now.

## Recommended architecture

Build a small, purpose-built analytics layer on top of the app's **existing** Express + MongoDB backend — no new database, no new framework, no third-party vendor. A new, tightly-controlled ingestion endpoint accepts short "this happened" events from the app; a separate, locked-down table maps a random analytics ID to a real account only where strictly necessary (and never exposes that mapping to any report or dashboard); everyday reporting only ever looks at aggregated numbers, never at any individual's activity. This grows in later phases into scheduled daily rollups and a proper internal dashboard — an external analytics vendor is deliberately **not** recommended given how sensitive emotional-wellness data is; it isn't worth the added privacy exposure at this app's current size.

## Privacy safeguards

- Every event records **what happened and when**, never who did it, using a random ID instead of any real account identifier.
- Names, emails, phone numbers, tokens, exact locations, and — critically for this app — the user's actual typed feelings or affirmation text are **never** collected. Only a small, fixed list of broad emotion categories (e.g., "hopeful," "anxious") is ever recorded, never the user's own words.
- The one table that could connect analytics data back to a real person is locked down separately from all reporting tools, and is deleted immediately when someone deletes their account.
- Any dashboard breakdown too small to be meaningful (e.g., a handful of people) is automatically hidden rather than shown as an exact, potentially re-identifying number.

## Minimum viable implementation

A first phase covering nine events — app opened, onboarding completed, emotion selected, affirmation generated (and failure), affirmation viewed, affirmation rated, new-AI requested, and session completed — is enough to answer the most important early questions: are people finishing onboarding, are they reaching an affirmation, and is generation actually working. This is a **Large** scope of work primarily because the app currently has zero analytics code to build on top of, not because any single event is complicated.

## Major decisions needed

1. Whether the app needs a dedicated analytics opt-out, beyond what the app stores already.
2. How long raw event data should be kept (13 months is proposed).
3. What counts as a "small enough to hide" group size on dashboards (20 people is proposed).
4. Whether any internal tool should ever be allowed to view one anonymous person's full activity history — even without their name attached — for support or debugging purposes. This is flagged as the single most sensitive open question in the whole design and deserves its own dedicated review.
5. Whether the app's account-deletion feature (which this analysis could not fully verify from the local codebase — see below) already does what this design assumes it does.

## Recommended next step

Hold a short decisions-and-privacy-review session (Phase 0 in the implementation plan) to confirm the event list, the definitions of "activated" and "returned" user, and the open decisions above — before any engineering work begins. Separately, and independent of analytics: the actual backend code that runs in production should be reconciled against what's in this local repository, since this review found real, concrete mismatches between the two (see below) that would otherwise cause the same kind of confusion analytics work is meant to help prevent.

## Estimated complexity by phase

| Phase | Scope | Complexity |
|---|---|---|
| 0 — Decisions & privacy review | Confirm definitions, prohibited-data rules, retention policy | **S** |
| 1 — Minimum viable measurement | Core 9-event set, basic ingestion, no dashboard yet | **L** |
| 2 — Retention & feature adoption | Return/D1/D7/D30, save/listen/insight tracking, first dashboard | **M** |
| 3 — Acquisition attribution | Campaign links, referral codes, "how did you hear about us" | **L** |
| 4 — Automated insights | Weekly report, trend/anomaly detection, evidence-labeled findings | **XL** |

## Repository areas that could not be fully assessed

The backend code in this local repository (`server.js`, `routes/`) does **not** reliably reflect what's actually deployed. This isn't a guess — the client app calls several backend endpoints (account deletion, account profile, social login, password reset, the emotion dashboard, context questions) that simply don't exist anywhere in this checkout's code, and one existing route file references a module (`utils/jwt.js`) that also isn't present. This matches a previously documented incident where this same drift caused a real production-adjacent scare. As a result, this analysis is grounded wherever possible in what the mobile app actually does over the network (a reliable signal) rather than trusting the local backend files at face value, and every backend-dependent recommendation in the full document set is marked for verification against the real, authoritative backend before it's built.

## Documentation produced

All twelve required documents plus this summary were written to `docs/product-analytics/` in this repository (not committed — see confirmation below):

1. `PRODUCT_ANALYTICS_CURRENT_STATE.md`
2. `PRODUCT_ANALYTICS_ARCHITECTURE.md`
3. `PRODUCT_ANALYTICS_FUNCTIONAL_SPEC.md`
4. `PRODUCT_ANALYTICS_EVENT_CATALOG.md`
5. `PRODUCT_ANALYTICS_API_SPEC.md`
6. `PRODUCT_ANALYTICS_DATA_MODEL.md`
7. `PRODUCT_ANALYTICS_PRIVACY_SECURITY.md`
8. `PRODUCT_ANALYTICS_METRICS.md`
9. `PRODUCT_ANALYTICS_IMPLEMENTATION_PLAN.md`
10. `PRODUCT_ANALYTICS_TEST_PLAN.md`
11. `PRODUCT_ANALYTICS_DECISIONS_AND_RISKS.md`
12. `PRODUCT_ANALYTICS_EXECUTIVE_SUMMARY.md` (this file)
