# AI AFFIRM — Global Rules

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
