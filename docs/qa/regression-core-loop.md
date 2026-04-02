# Core loop regression checklist (3/20/2026)

Goal: validate a build in ~15–20 minutes before tagging/releasing.
Scope: login/verify, guest + account emotion loop, Next, rating, Top 3 refresh, basic notification tap.

## 0) Build + sync sanity (2–3 mins)
- [ ] Confirm `public/` is source of truth
- [ ] Run `npx cap sync`
- [ ] Confirm both bundles updated:
  - [ ] `android/app/src/main/assets/public/` exists
  - [ ] `ios/App/App/public/` exists

## 1) Launch (1 min)
- [ ] App opens on device without crash
- [ ] Profile UI renders (no blank screen)

## 2) Guest core loop (4–5 mins)
- [ ] Guest mode visible (no forced login)
- [ ] Tap an emotion chip (e.g., Calm) → affirmation loads
- [ ] Tap “Next Affirmation” → changes affirmation
- [ ] Tap “Other” → type a custom emotion → submit → affirmation loads
- [ ] Close + reopen app → guest still works (no dead taps)

## 3) Account core loop (6–7 mins)
- [ ] Login succeeds with test account
- [ ] Profile loads after login
- [ ] Tap an emotion → affirmation loads
- [ ] Rate affirmation (if shown) → refresh page → rating still shown/persisted
- [ ] Tap “Next Affirmation” → rotates to next ranked affirmation

## 4) Verify + password recovery (3–4 mins)
- [ ] New account registers successfully (or confirm flow reachable)
- [ ] If unverified: login returns verify-required flow (no silent failure)
- [ ] Forgot password page loads and submits request without error
- [ ] Reset link works and user can log in after reset

## 5) Insights refresh (1–2 mins)
- [ ] Log an emotion → Top 3 refreshes while staying on profile (event or cadence)

## 6) Notification tap routing (optional / build-dependent) (2 mins)
- [ ] A test local notification schedules and fires
- [ ] Tapping notification opens the app and lands on the intended screen/experience

## Notes / known issues
- (Add date-stamped notes here)