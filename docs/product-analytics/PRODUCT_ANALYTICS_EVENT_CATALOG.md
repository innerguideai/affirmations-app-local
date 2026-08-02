# Product Analytics — Event Schema & Event Catalog

Status: **proposal.** See [ARCHITECTURE.md](PRODUCT_ANALYTICS_ARCHITECTURE.md) for identifier design and [API_SPEC.md](PRODUCT_ANALYTICS_API_SPEC.md) for how these events are transmitted.

---

## 1. Event envelope (versioned schema)

```json
{
  "eventId": "UUID",
  "schemaVersion": 1,
  "eventName": "affirmation_viewed",
  "analyticsUserId": "random identifier or null",
  "anonymousSessionId": "random session identifier",
  "installId": "random installation identifier or null",
  "occurredAt": "2026-07-27T14:32:10.123Z",
  "receivedAt": "2026-07-27T14:32:11.402Z",
  "timezone": "America/Los_Angeles",
  "platform": "ios",
  "appVersion": "1.6.0",
  "buildNumber": "4",
  "environment": "prod-a",
  "properties": {}
}
```

### 1.1 Field responsibility

| Field | Supplied by | Required | Notes |
|---|---|---|---|
| `eventId` | Client (server for server-generated events) | Required | UUID v4; primary dedup key |
| `schemaVersion` | Client | Required | Integer; ingestion rejects versions it doesn't know how to process |
| `eventName` | Client/server | Required | Must be on the allowlist (§3) |
| `analyticsUserId` | **Server** (resolved via `identity_link`, never client-supplied) | Optional (`null` before any identity resolves) | Client never sends this — see [ARCHITECTURE.md §5](PRODUCT_ANALYTICS_ARCHITECTURE.md#5-identifier-design) |
| `anonymousSessionId` | Client | Required | Generated at session start |
| `installId` | Client | Optional but expected | `null` only if generation somehow failed client-side |
| `occurredAt` | Client | Required | Client-clock timestamp, ISO-8601 UTC |
| `receivedAt` | **Server** | Derived | Stamped at ingestion, never client-supplied |
| `timezone` | Client | Required | IANA name, used for calendar-day bucketing (see [Functional Spec §4](PRODUCT_ANALYTICS_FUNCTIONAL_SPEC.md#4-timezone-strategy)) |
| `platform` | Client | Required | `ios` \| `android` (no web client exists for this app) |
| `appVersion` / `buildNumber` | Client, via `App.getInfo()` (Capacitor `@capacitor/app` — already bundled, currently unused per [Current State §1.9](PRODUCT_ANALYTICS_CURRENT_STATE.md#19-existing-app-version-and-platform-information)) | Required | Newly wired up as part of this work — not available today |
| `environment` | Client (or inferred server-side from the request's API base) | Required | One of `dev`, `prod-a`, `prod-b` per [Current State §1.9](PRODUCT_ANALYTICS_CURRENT_STATE.md#19-existing-app-version-and-platform-information)'s known endpoints |
| `properties` | Client/server | Required (may be `{}`) | Only allowlisted keys per event survive validation — see §3 and per-event tables below |

### 1.2 Rejected-when-present (envelope level)
Any additional top-level key not in the table above is stripped at ingestion. `properties` is the only place event-specific data goes — this keeps the allowlist enforceable at a single, predictable location in the payload.

---

## 2. Globally prohibited properties (apply to every event, no exceptions)

Name, email address, phone number, Apple/Google identity or token, access/refresh tokens, full/exact IP address, exact device identifier (IMEI/serial/advertising ID), exact GPS location, any user-entered free text (context-answer text, feedback text, referral message), exact emotion text (only the fixed broad-category enum is ever allowed — see §4), affirmation text or GPT prompt text, raw error stack traces that could embed user input.

Ingestion enforces this at the envelope-validation layer regardless of per-event allowlists (defense in depth — see [ARCHITECTURE.md §7](PRODUCT_ANALYTICS_ARCHITECTURE.md#7-event-validation-allowlisting-and-sensitive-property-rejection)).

---

## 3. Broad emotion category enum

Because `emotionlogs.emotion` today stores free-form lowercase text (`routes/emotions.js`, `routes/affirmations.js`), analytics must **never** copy that field verbatim. A fixed, product-approved category enum is required before Phase 1 ships any emotion-related event — **[OPEN QUESTION / PRODUCT DECISION]**, proposed starting set based on emotions visibly referenced in the codebase (`admin.js`'s mock data uses "anxious"/"hopeful"; the "Other" picker and support-nudge logic reference free text generally): `joyful`, `calm`, `grateful`, `hopeful`, `anxious`, `sad`, `angry`, `overwhelmed`, `lonely`, `other`. The `other` bucket exists precisely so free text entered via the "Other" picker never needs to be categorized precisely — it's recorded as `other` and nothing more specific, by design.

---

## 4. Naming convention

All event names are **past tense**, `snake_case`, `object_verb` order (e.g. `affirmation_viewed`, not `view_affirmation`) — consistent with the event names already specified in the brief and easy to read as "this thing happened." Exception: a small number of present/imperative-feeling names describing a request in flight (`affirmation_requested`, `new_ai_requested`) are kept as specified since they represent an intent-to-act event distinct from its outcome event, and renaming them would break the clear pairing with `affirmation_generated`/`affirmation_generation_failed`.

---

## 5. Full event catalog

Legend — **Producer**: C = client, S = server, C+S = both with server dedup, D = derived (never emitted directly). **Privacy class**: A = behavioral, no identity risk; B = behavioral, sensitive-adjacent (e.g. wellbeing category); see [Privacy & Security](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md) for class definitions.

### 5.1 Application and session events

| Event | Definition | Trigger | Producer | Required properties | Optional properties | Prohibited | Dedup | Funnel milestone? | Related metric | Privacy class | Retention |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `app_opened` | App brought to foreground (cold start or resume) | `App.getInfo()`/lifecycle listener newly wired to `capacitor.entry.js` | C | `coldStart` (bool) | — | device id, IP | `eventId` | Yes | App opens, new vs. returning | A | 13 months |
| `session_started` | A new bounded app session begins | First `app_opened` after >N minutes background (session-timeout threshold, product decision — see [Decisions](PRODUCT_ANALYTICS_DECISIONS_AND_RISKS.md)) | C | — | `entryPoint` (e.g. `notification_tap`, `direct`, `deep_link`) | — | `eventId` | No | Sessions per user | A | 13 months |
| `session_completed` | Session ends (background/timeout) | Client detects backgrounding beyond threshold, or next `session_started` implies the prior one closed | C | `durationMsBucket` (bucketed, not exact ms, to reduce fingerprinting risk) | — | exact duration if it could fingerprint a very short session count, raw device timing | `eventId` | No | Session length distribution | A | 13 months |
| `user_returned` | A previously activated user acts on a new calendar day | — | **D** (derived from other events; never emitted) | n/a | n/a | n/a | n/a | Yes (retention) | D1/D7/D30 | A | n/a (computed from retained events) |

### 5.2 Authentication and account events

| Event | Definition | Trigger | Producer | Required properties | Optional | Prohibited | Dedup | Funnel milestone? | Related metric | Privacy class | Retention |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `account_created` | New account successfully registered | Server-side success of `POST /api/register` or `POST /api/auth/firebase` (first-time) | S | `method` (`email`\|`google`\|`apple`) | `wasGuestBefore` (bool) | email, name, tokens | `eventId` | Yes | New account registrations | A | 13 months |
| `login_succeeded` | Successful authentication | Server-side success of `POST /api/login` or `POST /api/auth/firebase` | S | `method` (`email`\|`google`\|`apple`) | — | email, tokens | `eventId` | No | — | A | 13 months |
| `login_failed` | Failed authentication attempt | Server-side failure of `POST /api/login` | S | `method`, `failureCategory` (`bad_credentials`\|`account_not_found`\|`email_not_verified`\|`server_error`) — **no raw error text** | — | email, password, raw error message, detailed reason that could aid credential-stuffing reconnaissance | `eventId` | No | Login reliability | A | 13 months |
| `password_reset_requested` | Reset flow initiated | Server-side receipt of `POST /api/password/forgot` | S | — | — | email | `eventId` | No | — | A | 13 months |
| `account_deleted` | Account deletion completed | Server-side success of `DELETE /api/account` (real delete, not the `?dryRun=1` preview) | S | — | — | — | `eventId` | No | Account deletion rate | A | 13 months (this event itself outlives the deleted `identity_link` row — see [Privacy & Security](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md#account-deletion-handling)) |

### 5.3 Onboarding events

| Event | Definition | Trigger | Producer | Required properties | Optional | Prohibited | Dedup | Funnel milestone? | Related metric | Privacy class | Retention |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `onboarding_started` | User enters the onboarding flow | `welcome.html` load, no `authToken`/valid guest trial present | C | — | — | — | `eventId` | Yes | Onboarding-start rate | A | 13 months |
| `onboarding_step_completed` | A discrete onboarding step is finished | Continue tap on `name.html`, `reminders.html`, `pathselection.html` | C | `stepKey` (`name`\|`reminders`\|`path_selection`), `stepNumber` | — | display name text, reminder time-of-day if considered sensitive-adjacent (treat as optional-only if approved) | `eventId` | Yes | Step-by-step drop-off | A | 13 months |
| `onboarding_completed` | Onboarding flow finished (guest bootstrap or account creation reached) | Arrival at `profile.html` (guest) or successful account creation from `account-entry.html` | C | `path` (`guest`\|`account`) | — | — | `eventId` | Yes | Onboarding-completion rate | A | 13 months |
| `onboarding_abandoned` | User leaves mid-onboarding without completing | Session ends (per `session_completed`) while `onboarding_completed` has not fired for this `analyticsUserId`/`installId` | **D** (derived, not emitted directly — avoids needing a fragile "user closed the app mid-flow" client-side detector) | n/a | n/a | n/a | n/a | Yes | Onboarding abandonment rate | A | n/a |

### 5.4 Core affirmation journey

| Event | Definition | Trigger | Producer | Required properties | Optional | Prohibited | Dedup | Funnel milestone? | Related metric | Privacy class | Retention |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `emotion_selected` | User selects (or free-texts, bucketed to `other`) an emotion | Chip tap in `profile.emotions.js` | C | `emotionCategory` (enum, §3) | — | exact/free emotion text | `eventId` | Yes | Emotion-selection rate | B | 13 months |
| `context_question_viewed` | A context question (driver/pressure) is shown | `showContextQuestion()` render | C | `order` (`1`\|`2`), `emotionCategory` | — | question/answer free text | `eventId` | No | Context-question engagement | B | 13 months |
| `context_question_answered` | User selects a context-question option | Option tap in `profile.context.js` | C | `order`, `emotionCategory`, `optionKey` (an opaque id/key for the selected option, **not** its display text) | — | option display text, free text | `eventId` | No | Context-question completion | B | 13 months |
| `affirmation_requested` | Intent to receive an affirmation is dispatched | Client: context flow completes and a fetch begins. Server: `POST /api/affirmations` or `/gpt` handler entry | C+S, deduped by `eventId` | `emotionCategory`, `sourceAttempt` (`ai`\|`db`) | `hasContext` (bool) | driver/pressure text, prompt text | `eventId` (client and server both send the same `eventId` for the same logical request) | Yes | Requests vs. successful generations | B | 13 months |
| `affirmation_generated` | An affirmation was successfully produced and persisted/returned | Server-side success of `POST /api/affirmations` (db) or `/gpt` (ai) | S | `source` (`ai`\|`db`\|`local_fallback`), `emotionCategory` | `timeToGenerateMsBucket` | affirmation text, prompt text | `eventId` | Yes | Generation success rate, fallback usage | B | 13 months |
| `affirmation_generation_failed` | Generation attempt failed | Server-side error/timeout from OpenAI call or DB query in the affirmation route | S | `failureCategory` (`upstream_ai_error`\|`upstream_ai_timeout`\|`db_error`\|`no_match_no_fallback`), `emotionCategory` | — | raw stack trace, prompt text | `eventId` | Yes | Generation failure rate | B | 13 months |
| `affirmation_viewed` | Affirmation rendered on screen | Client render of the affirmation card | C | `source` (`ai`\|`db`\|`local_fallback`), `emotionCategory` | — | affirmation text | `eventId` | Yes | Activation (2nd half) | B | 13 months |
| `affirmation_rated` | Star rating submitted | Server-side success of `POST /api/affirmations/rate` | S | `ratingValue` (1–5) | — | affirmation text | `eventId` | No | Rating participation | B | 13 months |
| `affirmation_saved` | Affirmation persisted to the user's saved set | Server-side: for account users, this is implicit in a successful `affirmation_generated` (every generated affirmation is already saved server-side per [Current State §1.12](PRODUCT_ANALYTICS_CURRENT_STATE.md#112-existing-rating-saving-listening-insight-and-new-ai-flows)) — **[PRODUCT DECISION NEEDED]**: whether to emit this as a distinct event at all, or treat "save rate" as always 100% of `affirmation_generated` for account users today, since there's no separate save action in the current UI. Recorded here for completeness per the requested taxonomy; recommend deferring unless/until an explicit save action is added | S (if kept) | `emotionCategory` | — | affirmation text | `eventId` | No | Save rate | B | 13 months |
| `affirmation_listened` | User played the audio/read-aloud version | Client-side `igSpeakAffirmation()` invocation in `profile.affirmations.js` — **entirely new instrumentation, since this action is invisible to the server today** | C | `emotionCategory`, `source` | — | affirmation text | `eventId` | No | Listen rate, listen↔return correlation | B | 13 months |
| `new_ai_requested` | User explicitly requests a new AI-generated affirmation | "New AI" button tap | C | `emotionCategory` | — | avoid-phrases text | `eventId` | No | New-AI request rate | B | 13 months |
| `insight_viewed` | A meaningful insight is viewed | `emotion-dashboard.html` renders a non-empty "Monthly Insight" card | C | `insightType` (`monthly_summary`\|`trend`\|`heatmap`) | — | insight narrative text if it ever contains user-specific phrasing | `eventId` | No | Insight engagement, meaningful-return input | B | 13 months |

### 5.5 Feedback and referral events

| Event | Definition | Trigger | Producer | Required properties | Optional | Prohibited | Dedup | Funnel milestone? | Related metric | Privacy class | Retention |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `feedback_started` | User opens a feedback flow | Tap on `support.html`'s feedback entry (if/when built — no dedicated feedback UI was found in this checkout beyond the support/nudge screens) | C | — | — | — | `eventId` | No | Feedback funnel | A | 13 months |
| `feedback_submitted` | Feedback successfully submitted | Server-side success of the feedback submission endpoint (does not exist yet — **new endpoint, Phase 2+**) | S | `category` (product-defined enum, e.g. `bug`\|`idea`\|`praise`\|`other`) | — | feedback free text (must **not** be stored in `analytics_events` — belongs in a private-content collection, not analytics, per the "no journal-style content" rule) | `eventId` | No | Feedback volume | A | 13 months |
| `referral_shared` | User shares a referral link/code | Tap on a share action (no such UI exists yet — Phase 3 feature) | C | `channel` (e.g. `share_sheet`, `copy_link`) | — | recipient identity, message text | `eventId` | Yes (acquisition funnel) | Referral shares | A | 13 months |
| `referral_attributed` | A new install/account is attributed to a referral | Server-side, at registration, if a referral code was actually redeemed | S | `attributionConfidence` (`confirmed`\|`probable`) | `referralCodeHash` (hashed, not raw code, if the raw code could be traced to a specific sharer's identity beyond what's needed for campaign reporting) | raw referral code if it's personally identifying, recipient identity | `eventId` | Yes | Referral conversion | A | 13 months |

---

## 6. Notes on events considered but intentionally scoped out of v1

- **Notification-related events** (`notification_scheduled`, `notification_tapped`) are not in the taxonomy above because the brief didn't request them, but given the app already has a rich, multi-ID native-notification system (`public/js/reminders.js` — ids `1001/1011/1013/1015/1020/1003/2001-2004`, see [Current State](PRODUCT_ANALYTICS_CURRENT_STATE.md)), a Phase 2 addition of `notification_tapped` (with `notificationCategory`, not the raw numeric id, as the property — the numeric ids are an implementation detail, not something a dashboard should have to know about) is recommended and flagged for product review.
- **Streak-related events** are deliberately not proposed as new analytics events — the existing streak feature is a distinct, already-shipped product feature with its own (client-only) mechanics; analytics' "meaningful return" definition is computed independently rather than re-emitting the existing streak logic as events (see [Functional Spec §2](PRODUCT_ANALYTICS_FUNCTIONAL_SPEC.md#2-meaningful-return)).
