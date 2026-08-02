# Product Analytics — Ingestion API Specification

Status: **proposal — design only, nothing implemented.** Mounted the same way existing routes are (`server.js:80-94` pattern: a route-factory function taking `db`, registered under `/api`), so it fits the existing Express app without introducing a new framework or process.

---

## 1. Endpoints

```http
POST /api/analytics/events
POST /api/analytics/events/batch
```

Both endpoints share one validation/enrichment/storage pipeline (§4–§8); `batch` simply loops the same per-event logic and returns a per-item result array (§9).

### 1.1 Why both a single and a batch endpoint
- Single: simplest for one-off, low-latency-sensitive events fired individually from the client.
- Batch: primary path for the recommended client design — a local queue flushed periodically (see [Architecture §8](PRODUCT_ANALYTICS_ARCHITECTURE.md#8-reliability-and-operational-design)) — since the app already has meaningful offline/backgrounded usage patterns (guest mode's entire affirmation flow works with zero network dependency today) and batching reduces both request volume and battery/radio use.

---

## 2. Authentication behavior

- **No dedicated analytics auth scheme.** The endpoint accepts the same credentials the rest of `/api` already does: `Authorization: Bearer <authToken>` and/or the session cookie, exactly as `resolveAuthenticatedUserId()` does in `routes/affirmations.js` today — reusing existing auth middleware/logic rather than inventing a parallel one.
- **Anonymous events are accepted without any auth header at all.** A guest user (today's app has no server-side guest auth token — see [Current State §1.5](PRODUCT_ANALYTICS_CURRENT_STATE.md#15-existing-user-identifier-strategy)) must still be able to send `app_opened`/`onboarding_started`/etc. before any account or guest-bootstrap identity exists. `analyticsUserId` resolves to `null` in that case and the event is still stored (see [Data Model](PRODUCT_ANALYTICS_DATA_MODEL.md) for how `null`-identity events are later reconciled once an identity does resolve, within the same `installId`/`anonymousSessionId`).
- The ingestion route never requires the client to pre-resolve or send `analyticsUserId` — that mapping happens **only** server-side via `identity_link`, so a compromised or reverse-engineered client can't forge someone else's `analyticsUserId`.

---

## 3. Request schema

### 3.1 Single event
```http
POST /api/analytics/events
Content-Type: application/json
Authorization: Bearer <authToken>   (optional)

{
  "eventId": "b3b1e2b0-...-uuid",
  "schemaVersion": 1,
  "eventName": "affirmation_viewed",
  "anonymousSessionId": "b7a5...-uuid",
  "installId": "9f21...-uuid",
  "occurredAt": "2026-07-27T14:32:10.123Z",
  "timezone": "America/Los_Angeles",
  "platform": "ios",
  "appVersion": "1.6.0",
  "buildNumber": "4",
  "environment": "prod-a",
  "properties": {
    "source": "ai",
    "emotionCategory": "hopeful"
  }
}
```
Note: `analyticsUserId` and `receivedAt` are never accepted from the client even if present in the body — they are always server-derived/overwritten (§2, and [Architecture §5](PRODUCT_ANALYTICS_ARCHITECTURE.md#5-identifier-design)).

### 3.2 Batch
```http
POST /api/analytics/events/batch
Content-Type: application/json
Authorization: Bearer <authToken>   (optional)

{
  "events": [ { "...single event object as above..." }, { "..." } ]
}
```

### 3.3 Batch size and payload limits
- Max **50 events per batch** request, max **256 KB** total request body. Chosen to comfortably cover a full onboarding-to-first-affirmation session's event volume (well under 20 events per [journey mapping](PRODUCT_ANALYTICS_CURRENT_STATE.md#2-current-journey-mapping)) while bounding worst-case request processing time on a shared Express process with no dedicated analytics workers.
- A batch exceeding either limit is rejected wholesale with `413 Payload Too Large` — the client is expected to split it and retry, not have the server silently truncate a batch (silent truncation would drop events without the client knowing which ones).

---

## 4. Validation (full sequence)

1. **Auth resolution** (§2) — best-effort; failure to resolve identity does not reject the request, only leaves `analyticsUserId = null`.
2. **Shape check** — every required envelope field present and correctly typed; reject with `400` and a field-level error list otherwise.
3. **`schemaVersion` check** — must be a version the server's validator recognizes; unrecognized future versions are rejected with `400` (not silently accepted and mis-parsed) so an old-vs-new client mismatch fails loudly rather than corrupting data.
4. **Event-name allowlist** — `eventName` must exist in the catalog ([EVENT_CATALOG.md](PRODUCT_ANALYTICS_EVENT_CATALOG.md)); unknown names → `422`.
5. **Per-event property allowlist** — unlisted keys inside `properties` are stripped (not rejected) and the stripping is recorded in a rejection-reason log (event name + which keys were stripped, not their values) for later triage, per [Architecture §7](PRODUCT_ANALYTICS_ARCHITECTURE.md#7-event-validation-allowlisting-and-sensitive-property-rejection).
6. **Sensitive-value pattern rejection** — regardless of allowlist status, a property value that looks like an email, a JWT, or free text well beyond the expected enum length → the **entire event** is rejected (`422`), not silently stripped, since accepting a sensitive value under an allowlisted key name is exactly the failure mode this guards against.
7. **Timestamp tolerance check** (§6) — informational flag only, does not reject.
8. **Dedup check** (§7) — a repeat of a previously accepted `eventId` is a no-op success, not an error.

---

## 5. Response codes

| Code | Meaning |
|---|---|
| `200` | Single event accepted (including a dedup no-op) |
| `207` | Batch processed with mixed per-item results (see §9) — used instead of a blanket `200`/`400` so the client can tell partial success apart from total success without parsing the body first |
| `400` | Malformed envelope (missing/mistyped required field) |
| `413` | Batch too large / payload too large |
| `422` | Event name not allowlisted, or a sensitive-value pattern was detected and the event was rejected outright |
| `429` | Rate limit exceeded (§8) |
| `500` | Unexpected server error — logged server-side, never blocks the calling UI flow regardless (client fire-and-forget, per [Functional Spec §6](PRODUCT_ANALYTICS_FUNCTIONAL_SPEC.md#6-non-functional-requirement-analytics-never-blocks-the-product)) |

### 5.1 Error response shape
```json
{
  "error": "invalid_event_name",
  "message": "eventName is not on the allowlist",
  "eventId": "b3b1e2b0-...-uuid"
}
```
`message` is a fixed, developer-facing string per error type (from a small enum of error codes) — never an interpolated stack trace or raw validation-library output, so the error response itself can't become a vector for leaking implementation detail or accidentally echoing back rejected sensitive content.

### 5.2 Batch (`207`) response shape
```json
{
  "results": [
    { "eventId": "...", "status": "accepted" },
    { "eventId": "...", "status": "deduped" },
    { "eventId": "...", "status": "rejected", "error": "sensitive_value_detected" }
  ]
}
```

---

## 6. Timestamp tolerance

- `occurredAt` up to **24 hours in the past** relative to `receivedAt` is accepted normally (covers realistic offline queueing per [Architecture §5.4](PRODUCT_ANALYTICS_ARCHITECTURE.md#54-identifier-handling-by-scenario)).
- `occurredAt` beyond 24h in the past, or **any amount in the future** beyond a small clock-skew allowance (e.g. 5 minutes, covering normal clock drift), is still **accepted** (rejecting it would lose real usage from a device with a wrong clock) but internally flagged `clockSkewSuspect: true` — excluded from default dashboard views, visible only in a diagnostic query. This is a deliberate accept-but-flag choice, not a reject, because rejecting silently loses data the product owner would want to know exists (e.g., "why is Day 1 return zero for this cohort" is a worse failure mode than "a few events have suspect timestamps").

---

## 7. Idempotency and deduplication

- Primary mechanism: a **unique index on `eventId`** in `analytics_events` (see [Data Model](PRODUCT_ANALYTICS_DATA_MODEL.md)). Ingestion attempts an insert; a duplicate-key error is treated as a successful no-op (`status: "deduped"`), not an error surfaced to the client.
- This makes the endpoint safe to retry blindly — a client that isn't sure whether its last flush succeeded can resend the same batch verbatim without double-counting.
- No secondary dedup heuristic (e.g., time+action fuzzy matching) is needed as long as every client always generates a real `eventId` — enforced by the schema requiring it (§4.2), not left optional "when convenient."

---

## 8. Rate limiting and abuse prevention

- Per `analyticsUserId` (when resolved) or per `installId` (when not): a generous cap (e.g., 500 events/hour) far above any real usage pattern in this app's actual journey (per [journey mapping](PRODUCT_ANALYTICS_CURRENT_STATE.md#2-current-journey-mapping), a full session is well under 20 events) — sized to catch a runaway client bug (e.g., an accidental emit-in-a-loop), not to constrain legitimate bursts.
- Secondary per-IP cap as a backstop against a single compromised/scripted client hammering the endpoint without a valid identity.
- Exceeding the cap returns `429` with a `Retry-After` header; the client's queue should hold events and retry later rather than drop them, but a sustained cap breach for one identity is treated as a signal to drop further events for that identity for the remainder of the window (protects the shared Mongo/Express process ahead of preserving every single event from a misbehaving client).

---

## 9. Partial batch failure behavior

Each event in a batch is validated and written independently; one event's rejection **never** aborts the rest of the batch. The `207` response's per-item `results` array lets the client know exactly which events succeeded, deduped, or were rejected — the client should not resend `"accepted"`/`"deduped"` items on a retry, only ones with `"rejected"` and only after confirming/fixing the underlying data issue (a malformed event class often indicates a client bug that resending as-is won't fix, so the client should log and drop `"rejected"` items after a bounded number of retries rather than retry indefinitely).

---

## 10. Server enrichment (what the server adds, beyond client input)

- `receivedAt` — server clock, always.
- `analyticsUserId` — resolved via `identity_link` from the authenticated `appUserId`, or `null`.
- `environment` — cross-checked/defaulted from which API base the request arrived on if the client doesn't send it, since the app already has three known backend targets (dev/prod-a/prod-b).
- `clockSkewSuspect` — internal-only flag (§6), never returned to the client, never shown on default dashboards.

No IP-derived geolocation is enriched by default — see §11.

---

## 11. IP address handling

**Recommendation: discard the full IP address at the application layer immediately after use, never store it.** The existing Express app has no IP-based logic in the affirmation/emotion routes today, so there's no existing dependency to preserve. If coarse country-level signal is ever wanted for a report (e.g., "which regions use the app"), derive it from the IP **in-process, at request time**, store only the resulting country code as an event property (if approved — currently not in the allowlist, see [EVENT_CATALOG.md](PRODUCT_ANALYTICS_EVENT_CATALOG.md)), and never persist the IP itself anywhere, including request logs feeding any future log-aggregation pipeline (relevant given [Current State's flag](PRODUCT_ANALYTICS_CURRENT_STATE.md#18-existing-logging-or-analytics) that current backend logging isn't privacy-reviewed either).

---

## 12. Logging requirements (operational, not user-facing)

- Log: request count, per-status-code count, rejection-reason counts (by reason, not payload), rate-limit trips, `clockSkewSuspect` counts — all aggregate/operational.
- Never log: full request bodies (they may contain values that *should have been* rejected — logging them defeats the purpose of rejecting them), raw IPs beyond what the platform's standard access log already captures (and that access log itself should be reviewed under the same IP-discard principle as §11, not assumed exempt).
- This ingestion route must not repeat `server.js:43`'s existing mistake of logging a secret to stdout — call out explicitly in code review for this route, given that mistake already exists elsewhere in this codebase.

---

## 13. OpenAPI-style contract summary

```yaml
paths:
  /api/analytics/events:
    post:
      summary: Ingest a single analytics event
      security: [] # optional bearer/cookie, see §2
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/AnalyticsEvent' }
      responses:
        '200': { description: Accepted or deduped }
        '400': { description: Malformed envelope }
        '422': { description: Not allowlisted / sensitive value detected }
        '429': { description: Rate limited }
  /api/analytics/events/batch:
    post:
      summary: Ingest up to 50 analytics events
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [events]
              properties:
                events:
                  type: array
                  maxItems: 50
                  items: { $ref: '#/components/schemas/AnalyticsEvent' }
      responses:
        '207': { description: Per-item results, see §9 }
        '413': { description: Batch/payload too large }
components:
  schemas:
    AnalyticsEvent:
      type: object
      required: [eventId, schemaVersion, eventName, anonymousSessionId, occurredAt, timezone, platform, appVersion, environment, properties]
      properties:
        eventId: { type: string, format: uuid }
        schemaVersion: { type: integer }
        eventName: { type: string }
        anonymousSessionId: { type: string, format: uuid }
        installId: { type: string, format: uuid, nullable: true }
        occurredAt: { type: string, format: date-time }
        timezone: { type: string }
        platform: { type: string, enum: [ios, android] }
        appVersion: { type: string }
        buildNumber: { type: string }
        environment: { type: string, enum: [dev, prod-a, prod-b] }
        properties: { type: object }
```
