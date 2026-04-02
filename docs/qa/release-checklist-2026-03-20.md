# Release checklist — 3/20/2026

## Scope
- Android: Capacitor wrapper + smoke-tested (no Play Store polish)
- iOS: existing Capacitor app + smoke-tested

## Pre-flight
- [ ] `public/` is current (diff vs `ios/App/App/public/` checked)
- [ ] ADR exists: `docs/adr/ADR-0001-android-approach.md`
- [ ] Smoke tests exist:
  - [ ] `docs/qa/android-smoke-test.md`
  - [ ] `docs/qa/ios-smoke-test.md`

## Android build artifacts
- [ ] Debug build: `cd android && ./gradlew :app:assembleDebug`
  - Output: `android/app/build/outputs/apk/debug/app-debug.apk`
- [ ] Release build (unsigned ok for now): `cd android && ./gradlew :app:assembleRelease`
  - Output: `android/app/build/outputs/apk/release/app-release-unsigned.apk`

## Android signing (paths only)
- [ ] Keystore path (local only): `android/keystores/release.jks` (DO NOT COMMIT)
- [ ] Local properties file: `android/keystore.properties` (git-ignored)
- [ ] Template exists: `android/keystore.properties.example`

## Regression gate
- [ ] Run core loop regression: `docs/qa/regression-core-loop.md` (15–20 mins) + record notes
- [ ] Android smoke test run and notes recorded: `docs/qa/android-smoke-test.md`
- [ ] iOS smoke test run and notes recorded: `docs/qa/ios-smoke-test.md`

## Post-build
- [ ] Update tracker rows with dates + links to artifacts (local paths)
- [ ] Tag release (if/when you do git tagging)
