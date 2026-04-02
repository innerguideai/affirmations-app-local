# Known issues (as of 2026-03-02)

## P0 — Android guest: emotion tap does nothing
**Platforms:** Android (Capacitor wrapper)  
**Mode:** Guest

### Repro
1. Launch app on Android emulator/device
2. Stay in guest mode (do not log in)
3. Tap any emotion button

### Expected
- UI shows a loading state and then an affirmation (or at least logs the emotion and updates UI).

### Actual
- Nothing happens (no visible UI change).

### Quick checks / logs to capture
- Android Studio: Logcat (filter: `chromium` and `Capacitor/Console`)
- In WebView console logs (if visible):
  - log `ig_auth_mode`
  - log `currentUser`
  - log localStorage write/read for last emotion
- Confirm the click handler fires (add a temporary `console.log("emotion click", emotion)` in `public/js/profile.emotions.js`)

## P0 — Login fails on iOS + Android (“incorrect password”)
**Platforms:** iOS + Android  
**Mode:** Account

### Repro
1. Open app on iOS or Android
2. Go to login
3. Enter known-good credentials
4. Submit

### Expected
- Login succeeds and redirects to profile.

### Actual
- “Incorrect password” error shown.

### Quick checks / logs to capture
- Server logs around `/api/login` for the attempt (timestamp + email used)
- Confirm request payload (email casing, trimming)
- Confirm `bcrypt.compare()` path (bcrypt vs bcryptjs) used by backend
- Check `/api/me` response immediately after login attempt
