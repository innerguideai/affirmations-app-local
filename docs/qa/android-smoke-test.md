# Android smoke test (3/20/2026)

Goal: validate a build in ~10 minutes before tagging/releasing.

## Build
- [ ] `cd android && ./gradlew :app:assembleDebug` → BUILD SUCCESSFUL
- [ ] APK exists: `android/app/build/outputs/apk/debug/app-debug.apk`

## App launch
- [ ] App opens on emulator/device without crash
- [ ] Home screen renders UI from `public/`

## Guest path
- [ ] Guest mode visible (no forced login)
- [ ] Tap an emotion → UI responds (loading state or affirmation shown)
- [ ] “Next Affirmation” works after first affirmation appears

## Account path
- [ ] Login succeeds
- [ ] After login, `/profile` loads
- [ ] Tap an emotion → affirmation shown
- [ ] Rate an affirmation (if available) → rating persists on refresh

## Insights
- [ ] After logging an emotion, Top 3 refreshes (event: `ig:emotionLogged`)

## Notifications (if enabled in build)
- [ ] Local notification permission prompt behaves as expected
- [ ] One test notification schedules and fires

## Notes / known issues
- (Add date-stamped notes here)
