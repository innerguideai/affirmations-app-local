# Product Analytics — Storage / Data Model Design

Status: **proposal.** All new collections live in the existing MongoDB database `affirmationsDB` (`server.js:66`) — no new database technology is introduced. Collections are proposed only where justified by an actual requirement in this doc set, not speculatively.

---

## 0. Collections proposed vs. not proposed

| Collection | Proposed? | Phase | Why |
|---|---|---|---|
| `analytics_events` | Yes | 1 | Core event store — required for every metric in this design |
| `identity_link` | Yes | 1 | Required to keep `analyticsUserId` separated from `appUserId` (privacy requirement, not optional) |
| `analytics_user_profiles` | Yes | 1–2 | Small, per-`analyticsUserId` rollup (first-seen, activated-at, last-active) needed to compute D1/D7/D30 without rescanning all of `analytics_events` on every query |
| `daily_product_metrics` | Yes | 2 | Precomputed daily aggregates for dashboards/weekly reports — avoids expensive on-demand aggregation over a growing `analytics_events` collection |
| `retention_cohorts` | Yes, but Phase 3 | 3 | Only needed once cohort-by-activation-week reporting is built; premature before then |
| `growth_campaigns` | Yes, but Phase 3 | 3 | Only needed once attribution work begins — see [Architecture §11](PRODUCT_ANALYTICS_ARCHITECTURE.md#11-attribution-architecture) |
| `campaign_attribution` | Yes, but Phase 3 | 3 | Same as above |

Not proposed: a separate "sessions" collection (session boundaries are derived from `analytics_events` timestamps, not worth a dedicated collection at this scale — see [Metrics](PRODUCT_ANALYTICS_METRICS.md)); a separate "funnel_state" collection (funnel position is a query over `analytics_events`, not a maintained running state, to avoid a second source of truth that can drift from the raw events).

---

## 1. `analytics_events`

**Purpose**: append-only record of every accepted analytics event.

**Schema**
```js
{
  _id: ObjectId,                 // Mongo-internal, not the analytics eventId
  eventId: "uuid-string",        // client- or server-generated, globally unique
  schemaVersion: 1,
  eventName: "affirmation_viewed",
  analyticsUserId: "uuid-string" | null,
  anonymousSessionId: "uuid-string",
  installId: "uuid-string" | null,
  occurredAt: ISODate,
  receivedAt: ISODate,
  timezone: "America/Los_Angeles",
  platform: "ios" | "android",
  appVersion: "1.6.0",
  buildNumber: "4",
  environment: "dev" | "prod-a" | "prod-b",
  properties: { /* allowlisted, event-specific */ },
  clockSkewSuspect: false        // internal-only, never surfaced to reporting endpoints by default
}
```

**Required fields**: `eventId`, `schemaVersion`, `eventName`, `anonymousSessionId`, `occurredAt`, `receivedAt`, `timezone`, `platform`, `environment`.

**Indexes**
- Unique: `{ eventId: 1 }` — enforces dedup (§7 of [API_SPEC.md](PRODUCT_ANALYTICS_API_SPEC.md)).
- `{ analyticsUserId: 1, occurredAt: 1 }` — per-user timelines, D1/D7/D30 computation.
- `{ eventName: 1, occurredAt: 1 }` — funnel/metric queries scoped to one event type over a date range.
- `{ occurredAt: 1 }` — supports retention/archival sweeps (§8) and daily-rollup job range scans.
- Consider a TTL index only if raw-event retention (see [Privacy & Security](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md)) is implemented as an automatic expiry rather than a periodic archival job — either is viable; TTL is simpler operationally but less auditable than an explicit archival job that produces a record of what was removed.

**Unique constraints**: `eventId` only.

**Retention policy**: raw events retained 13 months by default (covers year-over-year comparison plus a buffer), then archived out of the live collection (moved to cold storage or summarized-and-dropped) — see [Privacy & Security](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md) for the full retention rationale.

**Deletion behavior**: individual events are never deleted for "account deletion" purposes (they contain no PII to begin with — see [Privacy & Security](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md#account-deletion-handling)); the only deletion that occurs on account deletion is in `identity_link` (§3), which severs the ability to resolve these events back to a person, without deleting the (already-anonymous) events themselves.

**Expected query patterns**: range scans by `eventName` + date range (funnels, adoption); per-`analyticsUserId` timeline scans (bounded — a user only ever has as many events as their real usage, which is inherently small for a reflection app used a few times a day at most); the daily rollup job scans one day's worth of new events at a time.

**Expected write volume**: bounded by real usage — per [journey mapping](PRODUCT_ANALYTICS_CURRENT_STATE.md#2-current-journey-mapping), a full session generates roughly 5–15 events; at even a few thousand daily active users this is a low-tens-of-thousands-of-writes-per-day collection, well within a single MongoDB instance's capacity without sharding — **do not over-engineer for a scale this app doesn't have yet.**

**Risks**: fastest-growing collection in the database; if the daily rollup job (§4) is skipped or delayed, dashboards will be forced into expensive live aggregations over an increasingly large collection — the rollup job is not optional infrastructure once past Phase 1's smallest scope.

---

## 2. `identity_link`

**Purpose**: the *only* place `appUserId` (the existing Mongo `ObjectId` used throughout `users`/`affirmations`/`emotionlogs`) and `analyticsUserId` (the new, opaque, random id) are ever connected. This collection is the privacy boundary the entire design depends on.

**Schema**
```js
{
  _id: ObjectId,
  appUserId: ObjectId,          // references users._id (existing collection, account or guest identity)
  analyticsUserId: "uuid-string",
  isGuest: true | false,        // was this appUserId a guest identity at link-creation time
  createdAt: ISODate,
  mergedFromAppUserId: ObjectId | null   // set if this row resulted from a guest→account merge (§5.4/§5.5 in ARCHITECTURE.md)
}
```

**Required fields**: `appUserId`, `analyticsUserId`, `createdAt`.

**Indexes**: unique `{ appUserId: 1 }` (one analytics identity per app identity at a time); `{ analyticsUserId: 1 }` (reverse lookup, needed rarely — e.g., abuse investigation).

**Unique constraints**: `appUserId` unique — an `appUserId` maps to exactly one `analyticsUserId` at any point in time.

**Retention policy**: retained only while the underlying `appUserId` exists and is not deleted.

**Deletion behavior**: **deleted immediately and permanently on account deletion** (`DELETE /api/account` success). This is the mechanism satisfying "any internal link between an application user and an analytics identifier must be access-controlled and unavailable through analytics reporting endpoints" and the account-deletion requirement — once this row is gone, no query against `analytics_events` can ever be traced back to the deleted `appUserId` again, even by an administrator, because the only linking record is gone.

**Access control**: this collection must **never** be queryable through any reporting/dashboard API. It is written by the ingestion route (to resolve/create a mapping) and read only by: the ingestion route itself, and a narrow, separately-audited internal tool for account-deletion processing and abuse investigation. See [Privacy & Security §Access controls](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md#access-controls).

**Expected query patterns**: point lookups by `appUserId` (on every ingested event that has a resolved identity) — must be fast and simple; this is a hot path, so keep the schema minimal.

**Expected write volume**: one row per distinct app identity that ever generates an event — bounded by the app's actual user count, not by event volume. Low.

**Risks**: this is the single highest-sensitivity collection in the whole design (see [Privacy & Security](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md)) — a leak or overbroad access grant here defeats every other privacy safeguard in this document. Treat access to this collection with the same rigor as access to the `users` collection's `password` field.

---

## 3. `analytics_user_profiles`

**Purpose**: small, denormalized per-`analyticsUserId` summary — avoids scanning all of `analytics_events` to answer "when did this user first activate" for every retention calculation.

**Schema**
```js
{
  _id: ObjectId,
  analyticsUserId: "uuid-string",
  firstSeenAt: ISODate,             // earliest event for this analyticsUserId
  activatedAt: ISODate | null,      // set once emotion_selected + affirmation_viewed both occur
  lastActiveAt: ISODate,
  lastMeaningfulActionAt: ISODate | null,
  activeDayCount: 42,               // running count of distinct calendar days with activity
  platformsSeen: ["ios"],
  isGuest: true | false             // most recent known state; see note below
}
```

**Required fields**: `analyticsUserId`, `firstSeenAt`, `lastActiveAt`.

**Indexes**: unique `{ analyticsUserId: 1 }`; `{ activatedAt: 1 }` (cohort queries); `{ lastActiveAt: 1 }` (WAU/MAU queries).

**Unique constraints**: `analyticsUserId` unique.

**Retention policy**: same lifecycle as `identity_link` for its "linked" fields' usefulness — but unlike `identity_link`, this document contains no `appUserId` reference at all, so it is **not** deleted on account deletion; it remains as an anonymous behavioral summary, consistent with "preserving only genuinely anonymous aggregate metrics where appropriate" (see [Privacy & Security](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md#account-deletion-handling)).

**Deletion behavior**: not deleted on account deletion (contains no direct identity link); may still be subject to the same 13-month-class retention ceiling as other analytics data, expiring on its own timeline rather than being purged reactively.

**Expected query patterns**: point read/update on every event ingestion (upsert-style); range scans for WAU/MAU and cohort reports.

**Expected write volume**: one upsert per event that resolves an `analyticsUserId` — same order of magnitude as `analytics_events` writes, though the document itself is small and the write is an update, not an insert, so it doesn't grow the collection further after the first event for a given user.

**Risks**: must be kept truly minimal — the temptation to add "helpful" denormalized fields here (e.g., last emotion category) risks it silently becoming a second identity-linkable profile. Any new field proposed for this collection should be reviewed against the same allowlist discipline as `analytics_events.properties`.

---

## 4. `daily_product_metrics`

**Purpose**: one row per (metric, date, dimension) produced by a scheduled rollup job over `analytics_events` — the read path for dashboards and the weekly report, so those surfaces never run expensive on-demand aggregations over raw events.

**Schema**
```js
{
  _id: ObjectId,
  date: "2026-07-27",             // the calendar day this row summarizes, in a stated reference timezone (see Metrics doc)
  metric: "activation_rate" | "app_opens" | "d1_return_rate" | ...,
  dimensions: { platform: "ios", appVersion: "1.6.0" } | {},  // optional breakdowns; {} = all-up
  value: 0.42,
  numerator: 128,
  denominator: 305,
  computedAt: ISODate,
  schemaVersion: 1
}
```

**Required fields**: `date`, `metric`, `value`, `computedAt`.

**Indexes**: `{ metric: 1, date: 1, dimensions: 1 }` compound, supporting both "this metric over time" and "this metric today, broken down."

**Unique constraints**: `{ metric, date, dimensions }` composite uniqueness (re-running the rollup job for a given day should upsert, not duplicate).

**Retention policy**: aggregates carry no identity risk at all — retained indefinitely (or per a much longer, product-chosen horizon) since they're the cheapest, safest thing in this whole design to keep around, and are exactly what year-over-year founder reporting needs.

**Deletion behavior**: never deleted for privacy reasons (contains no user-level data); only ever recomputed/corrected if a bug in the rollup job is found and a backfill is run.

**Expected query patterns**: "this metric, last N days" (dashboards, weekly report); "this metric, broken down by platform/version" (reliability reports).

**Expected write volume**: tiny — one row per (metric × date × dimension combination) per day, a rollup job run, not a live-traffic write path.

**Risks**: only as correct as the rollup job's definitions — must be kept in lockstep with the activation/return/timezone definitions in [Functional Spec](PRODUCT_ANALYTICS_FUNCTIONAL_SPEC.md); a silent definition drift between this table and ad-hoc queries against raw `analytics_events` is a real risk if both paths are used interchangeably without governance (recommend: raw-event queries are for investigation only, `daily_product_metrics` is the only source dashboards trust).

---

## 5. `retention_cohorts` (Phase 3)

**Purpose**: precomputed cohort-by-activation-week retention grid, so the reporting layer doesn't recompute a full cohort matrix on every dashboard load.

**Schema**
```js
{
  _id: ObjectId,
  cohortWeekStart: "2026-07-06",     // the Monday of the activation week
  weeksSinceActivation: 3,
  cohortSize: 214,
  retainedCount: 88,
  retainedRate: 0.41,
  computedAt: ISODate
}
```
Indexes: `{ cohortWeekStart: 1, weeksSinceActivation: 1 }` unique composite. Retention/deletion: same as `daily_product_metrics` (aggregate-only, no identity risk). Not built before Phase 3 — premature until enough weeks of activation history exist to make a cohort grid meaningful.

---

## 6. `growth_campaigns` and `campaign_attribution` (Phase 3)

**Purpose**: named-outreach records (campaign name, channel, tracked-link id) and the resulting attribution facts (which install/account resolved to which campaign, at what confidence). Deliberately **separate** from `analytics_events` — a campaign record may legitimately contain identifying information about the outreach itself (e.g., a named partner or ad platform), which must never be joined into the anonymous behavioral event stream. See [Architecture §11](PRODUCT_ANALYTICS_ARCHITECTURE.md#11-attribution-architecture) for the full flow and the confirmed/probable/unlinked distinction that `campaign_attribution.confidence` encodes.

```js
// growth_campaigns
{ _id, campaignId, name, channel, createdAt, linkIds: [...] }

// campaign_attribution
{ _id, campaignId, linkId, analyticsUserId, confidence: "confirmed" | "probable", attributedAt }
```

Not built in Phase 1/2 — flagged here only so the eventual schema shape is visible in this doc set, per the requirement to evaluate all six listed collections.

---

## 7. Cross-collection integrity notes

- `analytics_events.analyticsUserId` has **no** foreign-key-style enforcement to `identity_link` at the database level (MongoDB doesn't enforce cross-collection referential integrity) — the invariant ("every non-null `analyticsUserId` in `analytics_events` was, at some point, created via `identity_link`") is enforced entirely by ingestion-code discipline, not the schema. This is an accepted risk at this scale; a future migration to a stricter data layer isn't warranted yet.
- Deleting an `identity_link` row (account deletion) never cascades a delete into `analytics_events` — by design (§1's deletion behavior) — so there is no automated cascade to get wrong, which also means there is nothing to accidentally over-delete.
