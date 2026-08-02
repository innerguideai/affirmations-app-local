# Incident Summary — Backend Source-of-Truth Drift (My Affirmations feature)

**Date:** 2026-07-13
**Feature affected:** My Affirmations (save/list/remove affirmations for registered users)
**Status:** **Resolved and verified on EC2 DEV.** Corrected `routes/affirmations.js` (built from the authoritative source, with only the approved My Affirmations additions layered on) is deployed and passing. Production was never affected throughout.

## What happened

While building the My Affirmations backend routes over the past 2 days, all work was done against `/Users/ritusharma/affirmations-app/routes/affirmations.js` — the local working copy in the `affirmations-app` repo (GitHub remote: `affirmations-app-local`). This local file was treated as ground truth without verifying it against the actual authoritative backend source.

The real backend lives in a **separate repo, `affirmations-app-server`**, not cloned anywhere on this machine. The local `affirmations-app` repo's backend code (`server.js`, `routes/`) had drifted significantly from it.

**The stale local `routes/affirmations.js` was copied to EC2 DEV, and the DEV Node server was restarted — DEV is currently running the stale file.** Production was not touched and is unaffected.

## Divergence found (local vs. authoritative, compared against a version ~2 months old)

**Missing locally (and now missing on DEV):**
- `driver`/`pressure` context-aware DB matching in `POST /` and `GET /count`
- `hidden: { $ne: true }` filtering in `POST /`, `GET /next`, `GET /count`
- The full `/gpt` implementation — avoid-repeated-phrasing logic, first-person "I"-statement system prompt, richer context-aware user prompt, `context: { driver, pressure }` saved on each generated doc. Local had this exact code sitting **commented out as dead code**, with an older/simpler version active instead.
- No auth infrastructure at all: no `utils/jwt.js`, no `jsonwebtoken` dependency, no session middleware.

**Present locally (and now on DEV) but not in the authoritative version:**
- `POST /unified` and `GET /debug-user-match` routes

## Impact

DEV is currently serving degraded affirmation behavior: no first-person "I" statements, no driver/pressure context in prompts or DB matching, no hidden-flag filtering, no auth enforcement on any route. The three new My Affirmations routes (`resolveAuthenticatedUserId`, `POST /unsave`, `GET /saved`) were also built against this stale schema.

## Recovery available

The original, correct DEV file is backed up at:
```
/home/ec2-user/affirmations-app/backups/my-affirmations-rls003/affirmations.js
```

## Root cause

No process existed for verifying a local backend file against its authoritative source before copying it to any environment. The local working tree was implicitly trusted as current, and that trust carried through into a DEV deployment.

## New rule (established this session)

Before making any backend code change or deploying it anywhere: verify the target file against the authoritative repo/branch first — do not assume the local working tree is current. Additionally: **check with the user before making changes going forward.**

## Resolution

`routes/affirmations.js` was rebuilt from the authoritative backend code the user supplied directly (not the stale local copy), with exactly four additions layered on top: the `verifyUserToken` import, the `resolveAuthenticatedUserId` helper, `POST /unsave`, and `GET /saved`. Every other line — `POST /`, `GET /next`, `POST /gpt` (including the restored avoid-repeated-phrasing logic and first-person "I"-statement prompts), `POST /rate`, `POST /clear`, `GET /count` — was preserved byte-for-byte. `node -c` passed, and the diff against the authoritative source was confirmed to contain only those four additions.

The corrected file was deployed to EC2 DEV (`node -c` passed there too; DEV server restarted; unauthenticated `GET /saved` confirmed returning 401 immediately after restart).

## Verification (Xcode simulator + EC2 DEV, post-fix)

All of the following passed:
- Newest-first ordering with multiple items
- Empty state copy
- Guest gating (row fully hidden from Account menu, direct navigation shows sign-in gate)
- Two-account isolation
- Remove doesn't error and doesn't affect other affirmations' ratings (My Affirmations list doesn't display stars by design — out of original scope)
- Listen plays audio on both the affirmation-result screen and the My Affirmations list
- Tap-to-confirm Remove interaction (arm / cancel / confirm)
- Driver/pressure context-aware DB matching (restored behavior)
- Repeated-phrasing avoidance (restored behavior)
- GPT-to-DB switch via `/count` after ~2 affirmations per emotion (restored behavior)
- 30-day window
- Star rating, Next, New AI, and the emotion/driver/pressure selection flow — all unaffected

**Deferred, needs direct DB/API access (not reachable via simulator UI):**
- `hidden: true` exclusion from `/saved` (no UI control sets this flag anywhere in the app)
- Malformed-ID and cross-account `/unsave` attempts against live DEV (already covered by a mocked unit-test harness at the code level; not yet re-verified against the real deployed environment)

## Other open follow-ups (not blocking, tracked for later)

- Locate/clone `affirmations-app-server` properly so local and DEV can't drift silently again
- Frontend files (`public/my-affirmations.html`, `public/js/my-affirmations.js`, `public/account.html`) were confirmed compatible with the corrected backend response shape — no changes were needed
- Whether "driver"/"pressure" should be surfaced in the My Affirmations UI is an open product question, not addressed in the current UI
- Appium coverage was added (`pages/my-affirmations.page.js`, Scenario 4 in `appium-smoke.js`) but not yet run against a live simulator
