# AI AFFIRM (Affirmations App)

**guest mode** and account mode share the same UI shell, but routing + gating must use the same auth signals everywhere. This README documents the current source of truth for auth state, onboarding routing, and the iOS build workflow.

---

## Current Status

- **Stage:** MVP stable (core loop works)
- **Target:** Jan 19, 2026 release track (iOS)
- **Focus right now:** iOS (Capacitor) stability, onboarding skip rules, guest/account routing, and cleanup after an iOS/public folder mismatch

---

## What’s in the App

- **Guest trial**
  - Guest name onboarding (`ig_display_name`)
  - Trial window via guest trial helpers (see `js/guest.trial.js`)
- **Account signup/login**
- **Profile experience**
  - Emotion chips → fetch affirmation
  - Ratings (5-star) *(hidden for guest for now)*
  - Next affirmation (DB rotation)
  - AI fallback when DB is low/empty (server-driven)
  - Top emotions (30-day window) *(account only)*
- **Theme support**
  - Theme key saved and applied early to avoid a blank background

---

## Tech Stack

- **Frontend:** HTML/CSS/JS (no React yet)
- **iOS:** Capacitor WebView
- **Backend:** Node.js + Express behind Nginx on AWS (`api.innerguideai.com`)
- **Data:** MongoDB (users, affirmations, emotion logs)
- **AI:** Backend calls OpenAI in `/api/affirmations/gpt`

---

## Folder Structure and Source of Truth

This repo has two “public” folders:

- **Source of truth:** `public/`
- **iOS build artifact:** `ios/App/App/public/`

Rule: Do not edit `ios/App/App/public/` long-term.  
Make changes in `public/` and sync into iOS as needed.

(Temporary exception: fast iOS hotfixes during stabilization, followed by syncing back to `public/`.)

---

## Pages and Flows

### On launch (source of truth)
### On launch (source of truth)
- `index.html` is the front-door router.
- Once `ig_onboarded === "1"`, users should NOT see `welcome.html` or `pathselection.html` again (except explicit reset flows).
- Account persistence uses `/api/me` (when `apiFetch` is available) to skip `login.html` when the session is still valid.
- Guest persistence relies on `ig_auth_mode === "guest"` + `currentUser.isGuest === true` + `currentUserId` present.

### Onboarding
- `pathselection.html` (Account vs Guest)
- Guest name capture page (writes `ig_display_name`)

### Main app
- `profile.html` (core loop)
- `account.html` (settings + navigation hub)

### Guardrail: one handler per CTA
Do not wire the same button in two places (ex: inline `<script>` + `/js/*.js`).
This caused double-execution and unexpected `localStorage.clear()` during Guest selection.

---

## Auth + State Model (Source of Truth)

### App-wide auth signals
Use the same signals everywhere (do not invent new ones):

- `localStorage.getItem("ig_auth_mode")` → `"guest"` or `"account"`
- `currentUser` (JSON) → may contain `isGuest: true`
- `currentUserId` (string) → exists for both guest and account

**Guest if:**
- `ig_auth_mode === "guest"` **OR**
- `currentUser.isGuest === true`

**Account if:**
- `ig_auth_mode === "account"` **AND**
- `/api/me` returns 200 (when that page loads `apiFetch`)

### Important rule
`currentUserId` alone is not a “logged-in” signal. Guests also have a `currentUserId`.

### API helper
`apiFetch` is provided by `js/profile.api.js`.  
Any page that calls `/api/me` (or other backend endpoints) must load `profile.api.js`.

---

## Guest Normalization

### Why it exists
Some backend routes error if a non-24-hex `userId` is sent.

### What we do
For guests, we normalize to a stable 24-hex id and store it in:
- `localStorage.currentUserId`
- `currentUser._id` and `currentUser.id`
- `currentUser.isGuest = true`

This lets guest mode use the same APIs that accept `userId` without sending `guest-*` values.

### Guardrail: avoid `localStorage.clear()` in primary flows
- Do NOT use `localStorage.clear()` on the main Guest CTA.
- If a “Reset app” action is needed, make it an explicit separate button/route.
- Preserve `ig_onboarded` so returning users do not re-enter onboarding.


---

## Feature Gating Rules

### Profile (`profile.html`)
- Guest mode:
  - Emotion tap + affirmations work
  - Star ratings hidden
  - Hide Top 3 UI (no carousel, no footer chips, no “Top 3 emotions” label)
  - Do not call `/api/emotions/top` in guest mode
- Account mode:
  - Normal behavior (Top 3 calls allowed)

### Account (`account.html`)
- Guest mode:
  - Show “Create an account” group
  - Hide Logout
  - Keep “My affirmations” and “My Top 3 emotions” disabled
- Account mode:
  - Show Logout
  - Enable account-only rows

---

## `account.init.js` vs inline Account logic

- If `account.init.js` and inline logic both exist, remove duplication. Prefer one system to avoid conflicting UI toggles.


### `account.init.js`
`/js/account.init.js` exists to drive Account page UI from the real session:
- Calls `/api/me` using `apiFetch`
- Sets “Create an account” vs “Account information”
- Enables/disables rows

### Common pitfall
Inline “loggedIn” checks that treat `currentUserId` as proof of login will misclassify guests as logged-in.

Preferred pattern:
- Use `/api/me` where possible
- Otherwise use `ig_auth_mode` + `currentUser.isGuest`

---

## Password Reset (Implemented)

- Routes mounted under: `app.use("/api/password", passwordRoutesFn(db))`
- Implemented endpoints:
  - `POST /api/password/forgot` → generates token, stores sha256 hash + expiry (15 min) on user, emails reset link
  - `GET /api/password/validate` → checks token + expiry
  - `POST /api/password/reset` → sets new bcrypt password and clears reset token fields
- Email sending is centralized via `utils/mailer` (`sendResetEmail`)

---

## Email Verification (Planned)

Reuse the password reset pattern:
- Generate verification token → store sha256 hash + expiry on the user document
- Send verify link via the existing mailer utility
- Link opens a lightweight page on `api.innerguideai.com` (ex: `verify.html`) that confirms verification and tells the user to return to the app

---

## Running Locally (Web)

1. Install dependencies
2. Start backend
3. Open the web app pointing to your backend

(Commands vary by your local setup — keep the backend URL consistent with the app’s API base.)

---

## Building iOS (Capacitor)

Typical flow:
1. Update `public/`
2. Sync to iOS (copy assets into the iOS public bundle)
3. Build/run via Xcode on device

---

## Archiving for handoff (no Git)

If you’ve been archiving `ios/App/App`, this is a simple command pattern:

```bash
cd /path/to/affirmations-app
tar -czf ios-App-App-$(date +%Y-%m-%d)-$(date +%H%M).tar.gz ios/App/App
```

Optional: include `public/` too:

```bash
tar -czf web-public-$(date +%Y-%m-%d)-$(date +%H%M).tar.gz public
```

---

## Test Personas

- **JACK:** guest user who later creates an account
- **JILL:** guest-only user with trial expiry
- **JOHN:** logged-in user experience

Key validation:
- Logged-in greeting can use account profile data.
- Guest greeting uses `ig_display_name` and stays guest-only.

---

## How we continue coding (team rule)

- One microstep only: one file, one change, one verify.
- Confirm current state via console logs:
  - `ig_auth_mode`, `currentUserId`, `JSON.parse(currentUser).isGuest`
  - `/api/me` when `apiFetch` is loaded on that page
- Use app-wide auth signals (`ig_auth_mode` + `currentUser.isGuest`, and `/api/me` when available).
- Avoid introducing new storage keys. If a new key is unavoidable, update every page that reads auth.
- Always list exact files touched.
- Quick verify after each change:
  - Guest path + Account path

---
## Auth model (source of truth)

This app supports two auth paths. Do not assume `express-session` alone.

### Frontend auth signals (do not add new keys)
- `ig_auth_mode`: `"guest"` or `"account"`
- `currentUser`: JSON (may include `isGuest`)
- `currentUserId`: exists for guest + account; not proof of login

### API source of truth for logged-in account
- `/api/me` is the source of truth for account session/auth state.
- Pages that load `/js/profile.api.js` get `window.apiFetch()`.

### Bearer token (primary in Capacitor)
In Capacitor WebView, most authenticated API calls run via `apiFetch()` which adds:

- `Authorization: Bearer <token>`
- `credentials: "include"` is also set, but the token may be the thing that actually authenticates the request.

You can see this in console logs:
- `[apiFetch] token? true`
- `Authorization header: true`

### What this means for backend routes
If a backend route is “account-only”, it must accept the same auth method as `/api/me`:
- Token-based (Authorization Bearer) when present
- Session-based (`req.session.userId`) only as a fallback

Do not rely only on `req.session.userId` for account-only endpoints.

### Android (P0 scaffold for 3/20/2026)

- Android wrapper is generated via Capacitor in: `android/`
- Source web assets live in: `public/`
- Capacitor copies web assets into Android at build time:
  - `android/app/src/main/assets/public/`

#### Build/run
From repo root:
- Add platform (one-time): `npm install @capacitor/android@^8.0.1` then `npx cap add android`
- Open in Android Studio: open the `android/` folder
- Debug APK (terminal): `cd android && ./gradlew :app:assembleDebug`
  - Output: `android/app/build/outputs/apk/debug/app-debug.apk`
- Release APK (unsigned, terminal): `cd android && ./gradlew :app:assembleRelease`
  - Output: `android/app/build/outputs/apk/release/app-release-unsigned.apk`

#### Package/app name
- applicationId: `com.innerguideai.app`
- app name: `AI Affirm`

#### Signing (paths only; no keys committed)
- Keystore should live at: `android/keystores/release.jks` (DO NOT COMMIT)
- Local signing file: `android/keystore.properties` (git-ignored)
- Example template: `android/keystore.properties.example`

*Created and maintained by Ritu Sharma*
