# Product Analytics — Decisions & Risks Log

Status: **proposal.** Every row needs an owner and a review before Phase 1 implementation begins (see [Implementation Plan, Phase 0](PRODUCT_ANALYTICS_IMPLEMENTATION_PLAN.md#phase-0--decisions-and-privacy-review)).

---

### D1 — May analytics IDs be linked to account IDs?
- **Decision needed**: whether `identity_link` (the only table connecting `analyticsUserId` to `appUserId`) should exist at all, versus a design with no linkage whatsoever.
- **Choices**: (a) maintain the linkage table under strict access control (this design's proposal), (b) no linkage ever — fully anonymous analytics with no ability to resolve identity even for account-deletion cleanup or abuse investigation.
- **Recommendation**: (a). Without *some* linkage, account deletion can't reliably sever a user's connection to their own analytics history (there'd be nothing to sever), and abuse investigation (e.g., a user reporting a bug tied to specific behavior) becomes impossible. The linkage is the more defensible design precisely because it's tightly access-controlled, not because it's avoided.
- **Tradeoff**: (a) concentrates risk in one collection (`identity_link`) that must be protected rigorously; (b) is simpler but forecloses legitimate account-deletion and support use cases.
- **Owner**: Product + engineering lead, with privacy/legal sign-off.
- **Required review**: Privacy review (Phase 0).

### D2 — How does account deletion affect historical anonymous events?
- **Decision needed**: whether `analytics_events`/`analytics_user_profiles` rows should be deleted, retained as-is, or further anonymized on account deletion.
- **Choices**: (a) retain as-is once `identity_link` is severed (this design's proposal — events already contain no direct identity), (b) delete all historical events for that `analyticsUserId` outright, (c) retain but mark/quarantine for a grace period before permanent retention.
- **Recommendation**: (a), pending **[LEGAL REVIEW NEEDED]** confirmation that anonymous aggregate-eligible retention post-deletion satisfies the app's privacy-policy commitments and applicable law — see [Privacy & Security §11](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md#11-account-deletion-handling).
- **Tradeoff**: (a) preserves aggregate metric accuracy (deleting a user's history would distort historical funnel/retention numbers retroactively); (b) is the more conservative privacy posture but degrades historical reporting integrity every time someone deletes their account.
- **Owner**: Legal/privacy + product.
- **Required review**: **[LEGAL REVIEW NEEDED]**.

### D3 — Should broad emotion categories be stored?
- **Decision needed**: whether `emotionCategory` (fixed enum) is acceptable to store in analytics at all, given the app's wellness context, or whether emotion-related events should be scoped out of analytics entirely.
- **Choices**: (a) store the fixed broad category only, as proposed (Class B data, [Privacy & Security §1](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md#1-data-classification)), (b) exclude emotion category from analytics entirely, measuring only that "an emotion was selected" with no category at all.
- **Recommendation**: (a) — the product's core value questions ("which emotions drive engagement," "which categories correlate with return") are unanswerable under (b), and a fixed, reviewed enum is a meaningfully different risk profile than the app's existing free-text `emotionlogs.emotion` field.
- **Tradeoff**: (a) requires the enum (§3 of [Event Catalog](PRODUCT_ANALYTICS_EVENT_CATALOG.md#3-broad-emotion-category-enum)) to be finalized and kept broad enough to never approximate free text; (b) is simpler but discards genuinely useful, product-relevant signal.
- **Owner**: Product, with privacy input on the enum's granularity.
- **Required review**: Privacy review (Phase 0).

### D4 — Do users need an analytics opt-out?
- **Decision needed**: whether to offer an in-app, analytics-specific opt-out distinct from any OS-level tracking prompt.
- **Choices**: (a) no dedicated opt-out (treat this as service analytics, not marketing tracking), (b) offer an opt-out that stops event transmission entirely, (c) offer an opt-out that still transmits events but excludes the user from any individual-timeline view (aggregate-only regardless).
- **Recommendation**: not made here — this is explicitly a product/legal call, not a technical one (see [Privacy & Security §12](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md#12-analytics-opt-out-considerations)).
- **Tradeoff**: (a) is simplest but may not meet user expectations for a wellness app; (b)/(c) add engineering scope and a new UI surface.
- **Owner**: Product + legal.
- **Required review**: **[LEGAL REVIEW NEEDED]**, privacy review.

### D5 — Is installation-level tracking (`installId`) necessary?
- **Decision needed**: whether a separate `installId` (distinct from `analyticsUserId`) earns its complexity.
- **Choices**: (a) keep `installId` as proposed — needed to distinguish "new install" from "new behavioral identity" (a reinstall shouldn't look like a brand-new activated user if the same account logs back in), (b) drop it and rely on `analyticsUserId` alone.
- **Recommendation**: (a). Without it, "new installations" (an explicitly requested metric) can't be measured at all, and reinstall scenarios would silently conflate with returning-user scenarios.
- **Tradeoff**: (a) adds one more identifier to explain and manage; (b) is simpler but can't answer one of the brief's explicit questions ("how many people open the app" as distinct from "how many install it").
- **Owner**: Engineering lead.
- **Required review**: none beyond normal design review.

### D6 — Are client-side events reliable enough for key milestones?
- **Decision needed**: whether activation-critical events (`emotion_selected`, `affirmation_viewed`) should be trusted from the client alone, or require server corroboration.
- **Choices**: (a) client-only for view-type events (no server equivalent exists — Listen and View have zero network footprint today, per [Current State](PRODUCT_ANALYTICS_CURRENT_STATE.md#112-existing-rating-saving-listening-insight-and-new-ai-flows)), (b) require a server-side signal for every activation-defining event, which would mean redefining activation around only server-observable actions.
- **Recommendation**: (a), because the app's actual UI makes (b) impossible without changing product behavior (Listen especially is architecturally client-only, using `window.speechSynthesis`) — but this is explicitly named as a **known reliability limitation**, not a hidden one: client-only events are subject to the app crashing, being force-quit, or a bug in the instrumentation itself, in ways server-generated events aren't.
- **Tradeoff**: (a) accepts some measurement noise in exchange for measuring things that are otherwise unmeasurable at all; (b) would be more reliable but can't observe most of what the brief asks about.
- **Owner**: Engineering lead + product.
- **Required review**: none beyond normal design review; revisit if activation-rate numbers look implausible in practice.

### D7 — Is a queue necessary?
- **Decision needed**: whether Phase 1 needs asynchronous ingestion (queue/worker) or can validate-and-write synchronously on the request thread.
- **Choices**: (a) synchronous (Option A, [Implementation Plan](PRODUCT_ANALYTICS_IMPLEMENTATION_PLAN.md#option-a--minimal-server-analytics-on-the-existing-stack)), (b) asynchronous from day one (part of Option B).
- **Recommendation**: (a) for Phase 1, given the app's current real-world volume (per [Data Model §1](PRODUCT_ANALYTICS_DATA_MODEL.md#1-analytics_events), well within a single Express process's easy capacity); revisit as part of Phase 2's Option B adoption.
- **Tradeoff**: (a) is simpler now but risks becoming a bottleneck if usage grows faster than expected before Phase 2 ships; (b) is future-proof but is infrastructure this app has never operated before (no queue/cron exists today per [Current State §1.15](PRODUCT_ANALYTICS_CURRENT_STATE.md#115-deployment-architecture-relevant-to-analytics)), introduced ahead of an actual need.
- **Owner**: Engineering lead.
- **Required review**: revisit at Phase 2 planning.

### D8 — How long should raw events be retained?
- **Decision needed**: confirm or revise the proposed 13-month raw-event retention window.
- **Choices**: (a) 13 months as proposed (year-over-year comparison plus buffer), (b) shorter (e.g., 6 months, lower exposure/storage), (c) longer/indefinite (maximum historical analysis flexibility, higher exposure).
- **Recommendation**: (a) — the shortest window that still supports the founder-level "how does this year compare to last year" question explicitly implied by the brief's retention-window asks (D30, cohort-by-week).
- **Tradeoff**: shorter windows reduce exposure but limit long-horizon analysis; longer windows do the opposite.
- **Owner**: Privacy/legal + product.
- **Required review**: Privacy review (Phase 0).

### D9 — Minimum cohort size for dashboard breakdowns
- **Decision needed**: confirm or revise the proposed 20-user small-cohort suppression threshold.
- **Choices**: (a) 20 as proposed, (b) a different fixed number, (c) a percentage-of-total-base threshold instead of a fixed count.
- **Recommendation**: (a) as a starting point, explicitly revisited once real usage volume is known — a fixed threshold chosen before Phase 1 ships is necessarily a guess about the app's eventual scale.
- **Tradeoff**: too low a threshold risks re-identification in a small, real app; too high a threshold makes early-stage dashboards mostly suppressed and unhelpful.
- **Owner**: Product + privacy.
- **Required review**: Privacy review (Phase 0), revisit post-Phase-1 with real data.

### D10 — Does App Store attribution require an external provider?
- **Decision needed**: whether Phase 3 attribution work needs a paid SKAdNetwork-integrated attribution vendor, or can rely solely on tracked links + self-reported "how did you hear about us."
- **Choices**: (a) tracked-link + self-report only (no new vendor), (b) adopt a dedicated mobile attribution platform.
- **Recommendation**: not made here — explicitly deferred to Phase 3 planning, since it depends on how much acquisition spend the product actually does by that point; (a) is sufficient for organic/referral-heavy growth, (b) becomes worth the vendor dependency only once paid acquisition at meaningful volume is underway.
- **Tradeoff**: (a) is free and simpler but can only produce "probable," never "confirmed," attribution for most paid-channel installs, per Apple's platform limitations ([Architecture §11](PRODUCT_ANALYTICS_ARCHITECTURE.md#11-attribution-architecture)); (b) adds cost and vendor dependency for materially better attribution confidence.
- **Owner**: Growth/marketing lead.
- **Required review**: revisit at Phase 3 planning.

### D11 — Should administrators ever see individual pseudonymous journeys?
- **Decision needed**: whether any internal tool should ever let an authorized person view one `analyticsUserId`'s full event timeline (for support/research), even without ever resolving it to a real identity.
- **Choices**: (a) never — aggregate-only, no exceptions, (b) allow under the same audited-access model as raw-event queries (§8/§9 of [Privacy & Security](PRODUCT_ANALYTICS_PRIVACY_SECURITY.md#8-raw-event-access-restrictions)), for a narrow legitimate purpose (e.g., investigating a specific reported bug's event sequence).
- **Recommendation**: not made here — flagged as the most sensitive open question in this entire design, since even a pseudonymous full journey (sequence of emotion categories, generation failures, etc.) is a meaningfully different privacy posture than any aggregate view, and deserves its own dedicated privacy review rather than a default answer in this document.
- **Tradeoff**: (a) is safest but limits legitimate debugging/support use cases; (b) is more useful operationally but is the single feature most likely to make "aggregated, not identifiable" (a core stated design goal) untrue in practice if not tightly scoped.
- **Owner**: Privacy/legal + engineering lead.
- **Required review**: **[LEGAL REVIEW NEEDED]**, dedicated privacy review before any such tool is built — do not build ahead of this review.

---

## Additional risks not framed as binary decisions

| Risk | Description | Mitigation |
|---|---|---|
| Backend drift (repo-level) | This checkout's `routes/`/`server.js` do not reflect the authoritative deployed backend (`affirmations-app-server`, `innerguide-auth`) — confirmed by multiple endpoints the client calls that don't exist locally, and a missing `utils/jwt.js` that a local route requires ([Current State §0](PRODUCT_ANALYTICS_CURRENT_STATE.md#0-a-load-bearing-caveat-this-checkout-is-not-reliable-ground-truth-for-the-backend)) | Reconcile against the real backend repo before any server-side analytics code is written — a standing Phase 1 dependency, not a one-time caveat |
| Secret exposure in logs | `server.js:43` currently logs `OPENAI_API_KEY` to stdout | Fix or exclude before connecting any log-shipping/observability pipeline to backend output |
| Unauthenticated existing admin routes | `/admin/*` has no auth today | Do not model the new analytics reporting API on this pattern; give it its own auth from day one |
| Bundle ID mismatch (iOS) | `com.innerguideai.app` (Capacitor/Android) vs. `com.innerguide.aiaffirm` (actual iOS bundle) | Already tracked as a release-checklist gate independent of this work; analytics platform/version dimensions should tolerate either value until resolved |
| Client-enforced-only GPT daily quota | No server-side verification of the 3/day (guest) / 10/day (account) New-AI limit | Not an analytics concern to fix, but analytics should not assume the quota is actually enforced when interpreting `new_ai_requested` volume |
