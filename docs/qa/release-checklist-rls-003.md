# Release checklist — RLS-003

## Scope
- Frontend: RLS-003 release candidate (F-0246 Apple Sign-In, TD-0022 endpoint switch script)
- Target: TestFlight release candidate (Stage B) pointing to PROD API
- Backend PROD deploy: conditional — only if Stage B UAT shows the current PROD backend doesn't support the RLS-003 frontend

## Stage A — DEV UAT (completed)
- [x] Local/simulator Appium DEV UAT run — 50 PASS / 0 FAIL / 0 SKIP (2026-06-11)
  - 1 soft-fail noted: token-expiry redirect (see Deferred section, tracked separately in release tracker)
- No further action needed for Stage A

## Pre-flight — frontend release candidate
- [ ] `git status` clean / dirty files reviewed and resolved
- [ ] Commit Appium-passed RLS-003 release candidate (commit hash recorded below)
- [ ] **RELEASE BLOCKER** — Fix `scripts/switch-api-env.sh` so `public/js/social-auth.js` is included in `SOURCE_FILES` (currently hardcodes the DEV endpoint and is untracked by the script)

## Bundle ID consistency gate (required before archive)
- [ ] `capacitor.config.json` → `appId`
- [ ] `ios/App/App/GoogleService-Info.plist` → `BUNDLE_ID`
- [ ] Xcode target → bundle identifier
- [ ] Appium-tested bundle id (`com.innerguide.aiaffirm`)
- [ ] All four match — if not, resolve before archiving

## Endpoint switch to PROD
- [ ] Run `./scripts/switch-api-env.sh prod`
- [ ] Run `npx cap copy ios`
- [ ] Confirm `public/` source points to `https://api.innerguideai.com`
- [ ] Confirm `ios/App/App/public/` points to `https://api.innerguideai.com`
- [ ] Confirm no remaining DEV endpoint references (`54.221.158.219:3000`), including `social-auth.js`

## Stage B — TestFlight release candidate (PROD-pointing)
- [ ] Archive in Xcode
- [ ] Upload to App Store Connect / TestFlight
- [ ] Install fresh TestFlight build on device

## Focused TestFlight UAT (against current PROD backend)
- [ ] Email login / signup
- [ ] Google login
- [ ] Apple login
- [ ] Logout / re-login
- [ ] Profile load
- [ ] Emotion / context / affirmation flow
- [ ] No blank screens, no forced logout, no visible API failures

## Backend PROD deploy — decision gate
- [ ] Based on focused TestFlight UAT results, decide whether PROD backend needs updating for RLS-003 (Apple/Google/email auth or core flows)
  - [ ] NO → skip to Recordkeeping
  - [ ] YES → continue to Backend PROD deploy below

## Backend PROD deploy (only if required)
- [ ] Record current PROD branch + commit hash + timestamp
- [ ] Confirm PROD working tree is clean
- [ ] Run old-app compatibility checklist
- [ ] Take Mongo snapshot (if schema/data affected)
- [ ] Pull `main`, `npm install --omit=dev`, restart PM2
- [ ] Confirm PM2 online
- [ ] Run `/api/me` smoke test
- [ ] Re-run focused TestFlight UAT against updated PROD backend
- [ ] Rollback command staged before deploy; rollback if auth/core flows break or 5xx responses appear

## Apple review submission (separate step — do not combine with TestFlight upload)
- [ ] Only after TestFlight build passes focused UAT (and backend deploy re-test, if applicable)
- [ ] Release notes ready
- [ ] App Privacy / nutrition label reviewed if new auth providers added
- [ ] Do not submit until explicitly approved

## Deferred / non-blocking
- Token-expiry redirect soft-fail (tracked in release tracker)
- Apple Sign-In: new account creation + Hide My Email validation (UAT follow-up)
- #28 name handoff in account creation
- Sentry / APM
- CI/CD automation
- Blue-green / canary backend infra
- Automated rollback triggers
- TD-0017 health-check endpoint (stays proposal-only)

## Recordkeeping
- [ ] Frontend RC commit hash recorded
- [ ] Backend commit recorded (if deployed)
- [ ] App version / build number recorded
- [ ] Endpoint mode recorded: PROD
- [ ] Appium DEV UAT result recorded: 50 pass / 0 fail / 1 soft-fail (2026-06-11)
- [ ] Focused TestFlight UAT result recorded
- [ ] Apple review status recorded
- [ ] Release date recorded
- [ ] Rollback commit recorded (if backend deployed)
