# ADR-0001: Android approach for AI Affirm

Date: 2026-03-02  
Status: Accepted (for 3/20/2026 release)

## Context
AI Affirm is a Capacitor-based app today (iOS shipped). Web assets live in `public/` and are bundled into native shells. We need an Android path for the 3/20/2026 release that is low-risk, fast, and keeps `public/` as the single source of truth.

## Decision
Use a **Capacitor Android wrapper** (Android Studio + Gradle project generated via Capacitor) for 3/20/2026.

We will **not** start a Kotlin/Compose rewrite or React Native migration for 3/20.

## Options considered

### Option A — Kotlin + Jetpack Compose (native app)
**Pros**
- Best long-term native UX and performance
- Full Android-first patterns (navigation, lifecycle, background work)

**Cons**
- Requires re-building UI and flows from scratch
- Duplicates logic already working in `public/`
- High scope, not compatible with 3/20 timeline

**Fit for 3/20:** No

### Option B — React Native (new cross-platform stack)
**Pros**
- Single codebase for iOS/Android if we migrate fully
- Large ecosystem

**Cons**
- Migration work is significant (routing, auth, storage, UI)
- Adds new build/tooling complexity mid-release
- Still a rewrite; does not reuse current `public/` directly

**Fit for 3/20:** No

### Option C — Shared web wrapper (Capacitor)  ✅ Chosen
**Pros**
- Reuses current UI/logic in `public/`
- Fastest path to a working Android shell
- Keeps parity with iOS approach
- Lowest change surface for 3/20

**Cons**
- Some native UX gaps vs full-native (navigation/back, system UI polish)
- Plugin behavior can vary by platform; needs focused testing
- Performance constraints vs native for heavy UI (not currently a blocker)

**Fit for 3/20:** Yes

## Milestones

### By 3/20/2026 (Release scope)
- Android scaffold created via Capacitor (`android/` folder)
- Package name: `com.innerguideai.app`
- App name: `AI Affirm`
- Build + run on emulator shows the web-based UI
- Signing config **path** documented (no keys committed)
- Minimum smoke test: login, emotion log, next affirmation, top 3 refresh

### By 4/17/2026 (Next release scope)
- App icons replaced with branded assets
- Android navigation/back button behavior validated and patched if needed
- Local notifications tested end-to-end on Android
- Basic Android QA checklist added (device matrix + regression list)
- Play Store packaging path decided (AAB, signing, internal testing track)

## What gets cut for 3/20 (explicitly not doing)
- Native Kotlin/Compose app build
- React Native migration
- Full Play Store release readiness (listing, review assets, production rollout)
- Deep performance tuning and Android-specific UX polish beyond smoke test