# AI AFFIRM — Claude Code Project Guide

## Project Overview
- App name: AI Affirm (com.innerguideai.app)
- Frontend: HTML/CSS/JS in `public/`
- iOS: Capacitor WebView in `ios/`
- Android: Capacitor scaffold in `android/` — actively migrating to native Kotlin
- Backend: Node.js + Express on AWS at `api.innerguideai.com`
- Database: MongoDB
- AI: OpenAI via backend `/api/affirmations/gpt`

## Folder Rules
- `public/` is the web source of truth — iOS and Android sync FROM here
- `ios/App/App/public/` is generated — do not edit directly
- `android/app/src/main/assets/public/` is generated — do not edit directly
- Never modify `.env`, `android/keystore.properties`, or `android/keystores/`

## Auth Signals (source of truth — do not invent new ones)
- `ig_auth_mode` → "guest" or "account"
- `currentUser` → JSON, may contain `isGuest: true`
- `currentUserId` → exists for BOTH guest and account — NOT proof of login
- `/api/me` → source of truth for account session (returns 200 if valid)
- Bearer token attached via `apiFetch` in `js/profile.api.js`

## Guest vs Account Rules
- Guest if: `ig_auth_mode === "guest"` OR `currentUser.isGuest === true`
- Account if: `ig_auth_mode === "account"` AND `/api/me` returns 200
- Do NOT call `/api/emotions/top` in guest mode
- Hide star ratings in guest mode
- Hide Top 3 UI in guest mode

## Android Migration Rules
- We are migrating from Capacitor WebView to native Kotlin/Jetpack Compose
- Use MVVM architecture
- Use Jetpack Compose for all new UI
- Store auth token in EncryptedSharedPreferences via TokenManager
- Store preferences (theme, guest state) in DataStore
- Use Retrofit + OkHttp for all API calls
- BuildConfig.API_BASE_URL for all base URLs (never hardcode)
- Show me all files before writing them — I review before applying

## API Environments
- Debug: dev backend (to be configured)
- Release: `https://api.innerguideai.com`

## Coding Rules
- One file, one change, one verify at a time
- Always list exact files you are touching
- Never hardcode API keys, secrets, or URLs
- Never read or modify `.env` or any keystore files
- Show diffs before applying changes

## Test Personas
- JACK: guest who converts to account
- JILL: guest only (trial expiry)
- JOHN: full logged-in account user
