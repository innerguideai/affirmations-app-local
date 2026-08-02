# Product Analytics — Functional Specification

Status: **proposal.** Defines product-level behavior and definitions; see [ARCHITECTURE.md](PRODUCT_ANALYTICS_ARCHITECTURE.md) for the systems design and [EVENT_CATALOG.md](PRODUCT_ANALYTICS_EVENT_CATALOG.md) for the full event list.

---

## 1. Activation

**Definition used in this design:**
> A user is activated when they (1) select an emotion, and (2) successfully receive and view an affirmation.

Assessment against the actual app: this holds up well. `emotion_selected` → `affirmation_generated` (or DB-fallback equivalent) → `affirmation_viewed` is the real, unavoidable path every current user takes (per [journey mapping](PRODUCT_ANALYTICS_CURRENT_STATE.md#2-current-journey-mapping)) — there's no way to reach an affirmation without going through the context-question flow first. One nuance worth a product decision rather than assuming: today's client sometimes auto-triggers a GPT call the moment context questions are answered (no separate "view" tap is required — the result renders automatically). That means `affirmation_viewed` will, for most users, fire essentially simultaneously with `affirmation_generated`, not as a separate deliberate action. This is **not a flaw in the definition** — it just means "view" should be defined functionally as "the affirmation was rendered on screen," not "the user did something extra to see it," and instrumentation should treat automatic-render as a valid view. Flagged as **[OPEN QUESTION]** in [Decisions](PRODUCT_ANALYTICS_DECISIONS_AND_RISKS.md) only in case product wants a stricter definition later (e.g., requiring some dwell time).

Rating, saving, listening, and New-AI requests are **deeper engagement, not activation requirements** — consistent with the fact that guests never rate at all today (stars are hidden in guest mode) and would otherwise never be able to activate under a stricter definition.

## 2. Meaningful return

**Definition used in this design:**
> A user counts as returned when: (1) they were previously activated, (2) they use the app on a different calendar day, and (3) they complete a meaningful action.

Meaningful actions: emotion selection, receiving an affirmation, rating, saving, listening, New AI request, or viewing a meaningful insight (the emotion-dashboard "Monthly Insight" card, when it renders with real content — not an empty state).

This is a reasonable definition and matches the emotional-wellness nature of the product (opening the app without engaging shouldn't inflate retention numbers for a tool whose value is the act of reflecting). One gap worth calling out: **today's app has a daily streak feature already** (`profile.init.js`'s `incrementDailyStreak()`) that increments on "emotion submit," computed entirely client-side. The meaningful-return definition above is deliberately *not* wired to reuse that existing streak logic, because the streak counter has no server-side visibility and (per [Current State](PRODUCT_ANALYTICS_CURRENT_STATE.md)) is trivially resettable/inconsistent across devices for the same account. Meaningful return should be computed independently, server-side, from the new analytics event stream — the existing streak feature remains a separate, user-facing feature untouched by this work.

## 3. Retention windows

| Window | Definition |
|---|---|
| Day 1 (D1) | User was activated on day `N`; performed a meaningful action on calendar day `N+1` (their local day, see §4) |
| Day 7 (D7) | Meaningful action on day `N+7` |
| Day 30 (D30) | Meaningful action on day `N+30` |
| Weekly active users (WAU) | Distinct `analyticsUserId`s with ≥1 meaningful action in a trailing 7-day window |
| Monthly active users (MAU) | Distinct `analyticsUserId`s with ≥1 meaningful action in a trailing 30-day window |
| Active days per user | Count of distinct calendar days with ≥1 meaningful action, over a given period |
| Cohort retention by activation week | Group users by the calendar week they first activated; for each subsequent week, % of that cohort with ≥1 meaningful action |

D1/D7/D30 are evaluated as "did a meaningful action occur on **that specific day**," not "any day up to and including" — this is the standard, stricter definition and should be stated as such in any dashboard so it isn't confused with cumulative retention. Full formulas: [METRICS.md](PRODUCT_ANALYTICS_METRICS.md).

## 4. Timezone strategy

This needs an explicit decision because the app already has **conflicting precedent**:
- `routes/streaks.js` and `routes/export.js` both hardcode `APP_TZ = "America/New_York"` for computing "today"/"yesterday" for the existing streak feature — i.e., every user's streak day-boundary is currently anchored to US Eastern time regardless of where they actually are.
- A global analytics product, correctly, should bucket "calendar day" using **each user's own local timezone** at the moment of the event, not one fixed org timezone — otherwise a user in Asia gets their "day" cut at a time that has nothing to do with their actual daily rhythm, which directly undermines a metric like "did they use the app on a different day."

**Recommendation**: analytics day-boundaries use the **device-reported IANA timezone at `occurredAt`**, captured as a field on the event envelope (client-supplied, e.g. `"America/Los_Angeles"`), not the fixed `America/New_York` constant the streak feature uses. This is a deliberate, called-out divergence from existing streak behavior — not an oversight — and should be confirmed with product before Phase 2 retention work begins, since it means "Day 1 return" for analytics and "streak maintained" for the existing feature could disagree for a traveling user. See [DECISIONS_AND_RISKS.md](PRODUCT_ANALYTICS_DECISIONS_AND_RISKS.md).

A user's timezone can change (travel, device settings change) — day-boundary calculations use the timezone reported *on each individual event*, not a single stored "home timezone" per user, so a user's history isn't retroactively reinterpreted when their timezone changes.

## 5. Event producer responsibilities (functional summary)

See [ARCHITECTURE.md §6](PRODUCT_ANALYTICS_ARCHITECTURE.md#6-server-generated-vs-client-generated-events) for the full rationale. Functional restatement: any event describing "the user did X" (a tap, a view, a listen) is a client responsibility because the server frequently has no way to observe it at all (Listen never touches the network today). Any event describing "the system produced/stored Y as a result" (generated, saved, rated, account created/deleted) is a server responsibility, because the server is the only party that reliably knows whether the underlying write actually succeeded — this matters concretely here, since the app's client code has no visible retry/reconciliation logic today, so a client-only "it worked" event would silently diverge from what's actually in Mongo whenever a response is lost after a successful write.

## 6. Non-functional requirement: analytics never blocks the product

Restated here because it is a functional acceptance criterion, not just an architectural nicety: **no user-facing flow (onboarding, emotion selection, affirmation generation/display, rating, saving, listening, New AI, account deletion) may be delayed, altered, or fail because of an analytics call.** Acceptance test: disconnecting the analytics ingestion endpoint entirely (e.g., pointing it at a black hole) must produce zero observable difference in the app's core functionality from a user's perspective, only a gap in analytics data. See [TEST_PLAN.md](PRODUCT_ANALYTICS_TEST_PLAN.md) for the specific regression test.

## 7. Insights agent behavior (Phase 4) — functional rules

The future insights agent (see [ARCHITECTURE.md §9](PRODUCT_ANALYTICS_ARCHITECTURE.md#9-reporting-and-insights-architecture)) must label every statement it produces as one of:

| Label | Meaning | Example |
|---|---|---|
| **Directly measured fact** | A single aggregated number, no comparison implied | "142 users activated this week." |
| **Statistical comparison** | Two or more measured facts compared, with the comparison itself stated plainly | "Activation rate was 38% this week vs. 45% last week." |
| **Correlation** | Two measured trends move together, explicitly not claimed to cause one another | "Weeks with higher Listen usage also show higher D7 return; this does not establish that listening causes return." |
| **Hypothesis** | A possible explanation for an observed pattern, explicitly marked as unconfirmed | "One possible explanation for the activation drop is the release on [date] — not yet confirmed against a controlled comparison." |
| **Recommendation** | An explicit suggestion for what to look into or try, distinct from a finding | "Consider reviewing the onboarding step with the highest drop-off before the next release." |

The agent must **never** present a correlation as causation, and any release-linked observation ("activation declined after release X") must be phrased as "declined coincident with" unless a controlled before/after comparison genuinely isolates the release as the variable — which, given no experimentation framework exists in this app today, will rarely if ever be possible in Phase 4 as initially scoped.

## 8. Implementation options — functional framing

Three implementation options are evaluated in detail in [IMPLEMENTATION_PLAN.md](PRODUCT_ANALYTICS_IMPLEMENTATION_PLAN.md) (minimal server analytics on the existing stack; an expanded internal platform with async processing; an external analytics vendor). Functionally, all three must satisfy every requirement in this document (activation/return definitions, timezone strategy, non-blocking guarantee, insights-agent fact/hypothesis discipline) — the options differ in *how* they're built, not in *what* they must correctly measure.
