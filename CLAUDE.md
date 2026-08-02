# AI AFFIRM — Global Rules

---

## Current Status (verified 2026-07-11 — see ops/CLAUDE.md for company-level context)
- Active branch: `develop` (uncommitted changes present as of last check — review `git status` before starting work)
- Release state: **RLS-003 is in TestFlight Stage B** (PROD API), not pre-TestFlight. DEV UAT (Stage A) passed 50/0/0 on 2026-06-11.
- Known release blocker (from `docs/qa/release-checklist-rls-003.md`): `scripts/switch-api-env.sh` doesn't cover `public/js/social-auth.js` — fix before next PROD endpoint switch.
- A new sibling service, **`innerguide-auth`** (shared Google/Apple sign-in + cross-app identity, port 3002 in DEV), now exists at `~/innerguide-auth` and is referenced by this app's auth flow. See its `docs/AUTH_DESIGN.md`. Status per that doc: Phase 0 design approved, Phase 1 (Firebase Google Sign-In) build in progress, behind `ENABLE_FIREBASE_GOOGLE_LOGIN` flag (off by default).
- Bundle ID check: this file's Android section uses `com.innerguideai.app`; the RLS-003 release checklist references `com.innerguide.aiaffirm` for Appium testing. Confirm which is correct before archiving a release build.
- The old combined `~/truemind` repo (superseded by `truemind-local` + `truemind-server`) still has an active branch (`feature/firebase-google-signin`) with uncommitted changes — it has not been archived per the CLEANUP TODO. Do not delete until Ritu confirms the work there is captured elsewhere.

---

> **STOP: Read Before Acting.**
> This repo has fragile frontend / native / backend release state.
> Do not assume. Do not broadly clean up. Do not merge or reset without approval.
> Do not make design decisions without asking. Do one microstep at a time.
> See `AI_WORKFLOW_RULES.md` for the full operating playbook.

---

## Hard Rules (apply everywhere)
- Never modify `.env` or any keystore files
- Never commit secrets, API keys, or tokens
- Show all file changes before applying them
- One file, one change, one verify at a time
- Never touch `android/.claude/`
- Never touch `ios/` or `public/` for Android-only work, and vice versa

## Project Structure
- Frontend source of truth: `public/`
- Generated iOS web copy (do not edit directly): `ios/App/App/public/`
- Generated Android web copy (do not edit directly): `android/app/src/main/assets/public/`
- iOS native: `ios/`
- Android: `android/`
- Backend DEV: EC2 DEV repo (`http://54.221.158.219:3000`)
- Backend PROD: `https://api.innerguideai.com`

## Android Detail
For all Android migration instructions see: `android/CLAUDE.md`

## Full Operating Rules
All workflow, safety, Git, endpoint, native iOS, UI/design, stash, and recovery
rules are in `AI_WORKFLOW_RULES.md`. That file is the authoritative playbook.
