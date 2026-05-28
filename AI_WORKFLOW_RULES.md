# AI AFFIRM — AI Workflow Rules
# Authoritative operating playbook for all AI sessions in this repo.
# Last updated: 2026-05-27

---

> **STOP: Read Before Acting.**
> This repo has fragile frontend / native / backend release state.
> Do not assume. Do not broadly clean up. Do not merge or reset without approval.
> Do not make design decisions without asking. Do one microstep at a time.

---

## Rule 1 — Always Ask Before Design or Process Decisions

Do NOT make any of the following decisions without Ritu's explicit approval:

- Design or UI changes (layout, colors, fonts, spacing, theme)
- Product decisions (features, flows, copy, onboarding)
- Release decisions (version bumps, TestFlight, PROD deploy)
- Git decisions (branch, merge, rebase, reset, stash pop, cherry-pick)
- Endpoint decisions (switching DEV ↔ PROD)
- Native iOS decisions (Podfile, pod install, cap sync, AppDelegate, Info.plist)
- Architecture decisions (file structure, new patterns, dependency changes)
- Cleanup decisions (deleting files, renaming, reformatting, removing dead code)

If unsure whether something counts as a decision: **ask first, act second**.

---

## Rule 2 — Always State Work Mode Before Acting

Declare the work mode at the start of every action. Use exactly these labels:

| Mode | When to use |
|------|-------------|
| `INSPECT ONLY` | Reading files, searching, forensic review — no edits |
| `PLAN ONLY` | Proposing a plan — no edits until approved |
| `EDIT ONE FILE ONLY` | Changing exactly one file, shown before applying |
| `TEST ONLY` | Running commands to observe output — no code changes |
| `COMMIT ONLY AFTER APPROVAL` | Staging and committing — only after Ritu says go |
| `RECOVERY MODE` | Something is broken or lost — full forensic process |

Do not silently switch modes mid-task.

---

## Rule 3 — One Microstep at a Time

- Change one file at a time.
- Show the diff or content before applying.
- Confirm the result before moving to the next file.
- No multi-file sweeps or broad changes unless Ritu explicitly says "do all of them."
- No "I'll also fix..." side changes while working on a stated task.

---

## Rule 4 — Verify Source of Truth Before Any Edit

| Layer | Source of truth | Do NOT edit directly |
|-------|----------------|----------------------|
| Frontend | `public/` | `ios/App/App/public/`, `android/.../assets/public/` |
| iOS native | `ios/App/App/*.swift`, `Info.plist`, `Podfile` | — |
| Android native | `android/app/src/main/` | — |
| Backend DEV | EC2 DEV repo | — |
| Backend PROD | `api.innerguideai.com` EC2 | — |

Before editing any file:
1. Confirm which layer it belongs to.
2. Confirm it is the source, not a generated copy.
3. If `public/` and `ios/App/App/public/` differ unexpectedly → **stop and report** before touching either.

---

## Rule 5 — Never Mix Work Types in One Change

Keep these change types fully separate — never combine in one session step:

- Endpoint changes (DEV ↔ PROD switching)
- Native iOS changes (Podfile, AppDelegate, Info.plist, project.pbxproj)
- UI / design changes (HTML, CSS, theme files)
- JavaScript logic changes
- Docs / checklists / CLAUDE.md / rule files
- Release / admin work (version bumps, build config)
- Bug fixes
- Dependency changes (package.json, npm installs)

---

## Rule 6 — Create a Restore Point Before Risky Work

The following operations are risky. **Always create a timestamped backup first**:

```bash
# Public source backup
tar -czf archive/public-before-$(date +%Y-%m-%d-%H%M%S).tar.gz public/

# iOS generated web copy backup
tar -czf archive/ios-public-before-$(date +%Y-%m-%d-%H%M%S).tar.gz ios/App/App/public/

# Git state snapshot
git status --short > archive/git-status-$(date +%Y-%m-%d-%H%M%S).txt
git diff --stat    > archive/git-diff-stat-$(date +%Y-%m-%d-%H%M%S).txt
```

Risky operations requiring a prior backup:
- `git reset`, `git checkout`, `git restore`, `git merge`, `git rebase`
- Deleting or overwriting files
- Native iOS changes (Podfile, AppDelegate, Info.plist, project.pbxproj)
- `npx cap copy ios`
- `npx cap sync ios`
- `pod install`
- Restoring files from stash or archives
- Endpoint switching (DEV ↔ PROD)
- Any broad cleanup operation

---

## Rule 7 — Git Rules

### Before every commit, show all of the following and wait for approval:
```
git status --short
git diff --cached --stat
[list of staged files]
[proposed commit message]
```

### Never commit or push without Ritu saying "approved" or "go."

### Never include in a commit:
- `android/.claude/`
- `.backup_*` files created by the endpoint switch script
- `*.bak.*` backup files
- Accidental generated files (e.g. `ios/App/App/public/` source changes)
- `GoogleService-Info.plist` unless explicitly approved
- `.env`, keystore files, secrets

### Branch rules:
- Do not create, rename, merge, or delete branches without approval.
- Do not push to `main`, `staging`, or `origin/develop` without explicit go-ahead.
- Do not `git stash pop` or `git stash drop` without approval.

---

## Rule 8 — Endpoint Rules

RLS-003 DEV UAT stays on DEV API at all times unless Ritu explicitly approves a switch.

| Environment | API Base URL |
|-------------|-------------|
| DEV (RLS-003 UAT) | `http://54.221.158.219:3000` |
| PROD / TestFlight | `https://api.innerguideai.com` |

### Before any endpoint-touching work, ask:
> "Are we preparing DEV UAT or PROD/TestFlight UAT?"

### After any endpoint change, always run a full scan:
```bash
grep -rn "api.innerguideai.com" public/ --include="*.js" --include="*.html" --include="*.css" | grep -v ".bak." | grep -v ".backup_"
```
Expected result: zero matches for PROD endpoint in active files during DEV UAT.

### Files with endpoints (known as of 2026-05-27):
`forgot.js`, `login.js`, `profile.api.js`, `profile.js`, `reset.js`, `signup.js`,
`support.js`, `reminders.js`, `my-top3.html`, `verify-required.html`, `login.html`

---

## Rule 9 — Native iOS Rules

Do not run any of the following without explicit approval from Ritu:

| Command / File | Risk |
|----------------|------|
| `npx cap copy ios` | Overwrites `ios/App/App/public/` from `public/` |
| `npx cap sync ios` | Rewrites Podfile, runs pod install, overwrites generated files |
| `pod install` | Changes Pods lockfile and binary linking |
| Edit `ios/App/Podfile` | Changes native dependencies |
| Edit `ios/App/App/AppDelegate.swift` | Native app lifecycle — breaks build if wrong |
| Edit `ios/App/App/Info.plist` | URL schemes, ATS, permissions — critical |
| Edit `ios/App/App.xcodeproj/project.pbxproj` | Xcode project — corrupts if malformed |
| Edit `ios/App/App/capacitor.config.json` | Plugin registration — breaks plugin bridge if wrong |

Always build from `App.xcworkspace`, never from `App.xcodeproj`.

---

## Rule 10 — Design and UI Rules

For any visible UI change:
1. Ask which page, which element, which exact behavior.
2. Confirm the file and selector before editing.
3. Show the proposed change as a diff before applying.
4. Do not apply theme changes to files that don't belong to the theme system.
5. Do not remove or overwrite RLS-004 work while fixing RLS-003 issues (and vice versa).
6. Do not reorder, restructure, or rename UI components without approval.
7. Do not change CSS variables, color tokens, or font choices without approval.

---

## Rule 11 — Stash and Backlog Safety

Before concluding that any work is lost or overwritten, always inspect:

```bash
git stash list                          # Any stashed work?
git branch -a                           # Any feature/WIP branches?
ls archive/                             # Any file-system backups?
diff -rq public/ ios/App/App/public/    # Source vs generated drift?
git show stash@{0} --stat              # What's in the stash?
git show <stash-untracked-object> --stat  # Untracked files stash object?
```

Do not assume work is gone until all of the above are checked.
Do not run `git stash pop` or `git stash drop` until the stash contents are reviewed.

---

## Rule 12 — Recovery Mode

If Ritu says something is lost, overwritten, broken, missing, or asks to go back:

**Immediately switch to RECOVERY MODE. Do not touch any files until a plan is approved.**

### Recovery mode steps (in order):
1. **Stop all coding.**
2. **Do not reset Git. Do not delete anything.**
3. Snapshot current state:
   ```bash
   git status --short
   git diff --stat
   git log --oneline -10
   ```
4. Create timestamped backups of affected directories.
5. Inspect all restore candidates:
   - Git stash (`git stash list`, `git show stash@{0} --stat`)
   - Local branches (`git branch -a`)
   - Archive directory (`ls archive/`)
   - Tar/zip archive contents (`tar -tzf archive/*.tar.gz | grep <file>`)
   - Untracked stash objects (parents of stash merge commit)
6. Compare source vs generated:
   - `diff -rq public/ ios/App/App/public/`
7. Build a forensic table: file | current state | restore candidate | restore source | risk.
8. **Present recovery plan to Ritu. Do not execute until approved.**
9. Execute one file at a time. Verify each. Stop on first failure.

---

## Rule 13 — Communication Rule

- Be direct. State what is found, not what seems likely.
- Do not reassure Ritu without evidence ("it's probably just stale assets" is not acceptable).
- If something is unknown: inspect first, then report findings.
- If a command fails: stop, report the exact error, do not retry blindly.
- If a restore or edit could have unintended side effects: name them before acting.
- Format all status reports as tables when comparing multiple files or states.

---

## Quick Reference — Risky Operations Checklist

Before any risky operation, confirm all of the following:

- [ ] Backup created with timestamp in `archive/`
- [ ] Git status captured
- [ ] Work mode declared
- [ ] Ritu has approved this specific action
- [ ] Scope is limited to one file or one layer
- [ ] Endpoint state confirmed (DEV or PROD)
- [ ] Native files are not in scope (or explicitly approved)

---

## Project Auth Signals (source of truth — do not invent new ones)

| Signal | Meaning |
|--------|---------|
| `ig_auth_mode` | `"guest"` or `"account"` |
| `currentUser` | JSON, may contain `isGuest: true` |
| `currentUserId` | Exists for BOTH guest and account — NOT proof of login |
| `/api/me` → 200 | Account session is valid |
| Bearer token | Attached via `apiFetch` in `js/profile.api.js` |

Guest if: `ig_auth_mode === "guest"` OR `currentUser.isGuest === true`
Account if: `ig_auth_mode === "account"` AND `/api/me` returns 200

---

## Test Personas

| Persona | Profile |
|---------|---------|
| JACK | Guest who converts to account |
| JILL | Guest only (trial expiry) |
| JOHN | Full logged-in account user |
