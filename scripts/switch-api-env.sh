#!/usr/bin/env bash
# switch-api-env.sh — Interactive/scriptable API environment switcher for the frontend.
#
# Usage:
#   ./scripts/switch-api-env.sh          — interactive menu
#   ./scripts/switch-api-env.sh dev      — point all source files at DEV
#   ./scripts/switch-api-env.sh prod-a   — point all source files at PROD A
#   ./scripts/switch-api-env.sh prod-b   — point all source files at PROD B
#   ./scripts/switch-api-env.sh check    — report current state, no changes (read-only)
#
# Scans the complete public/ source tree (all .html/.js files) rather than a
# fixed file list. Never touches ios/App/App/public, android/.claude,
# node_modules, .git, or any backup file. Creates a timestamped backup of a
# file only when that file actually changes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PUBLIC_DIR="$REPO_ROOT/public"

# ─── Environment targets ──────────────────────────────────────────────────────
DEV_URL="http://54.221.158.219:3000"
PROD_A_URL="https://api.innerguideai.com"
PROD_B_URL="https://api-b.innerguideai.com"

# Every endpoint string that should be normalized away, regardless of which
# environment it happens to currently be. Includes legacy/stale patterns
# (old IP, localhost) alongside the three selectable environments.
KNOWN_ENDPOINTS=(
  "$DEV_URL"
  "http://54.210.216.72:3000"
  "http://localhost:3000"
  "$PROD_A_URL"
  "$PROD_B_URL"
)

# ─── Helpers ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
YLW='\033[1;33m'
GRN='\033[0;32m'
BLU='\033[0;34m'
CYN='\033[0;36m'
RST='\033[0m'

info()  { echo -e "${BLU}[INFO]${RST}  $*"; }
ok()    { echo -e "${GRN}[OK]${RST}    $*"; }
warn()  { echo -e "${YLW}[WARN]${RST}  $*"; }
err()   { echo -e "${RED}[ERROR]${RST} $*"; }
head_line() { echo -e "\n${CYN}━━━ $* ━━━${RST}"; }

require_python() {
  if ! command -v python3 >/dev/null 2>&1; then
    err "python3 is required for safe cross-platform in-place replacement, but was not found."
    exit 1
  fi
}

# Guard: never touch generated app copies, dependency dirs, vcs, or backups
is_forbidden() {
  local f="$1"
  [[ "$f" == *"/ios/App/App/public"* ]] && return 0
  [[ "$f" == *"/android/.claude"*     ]] && return 0
  [[ "$f" == *"/node_modules/"*       ]] && return 0
  [[ "$f" == *"/.git/"*               ]] && return 0
  [[ "$f" == *.bak                    ]] && return 0
  [[ "$f" == *.bak.*                  ]] && return 0
  [[ "$f" == *.backup                 ]] && return 0
  [[ "$f" == *.backup_*               ]] && return 0
  [[ "$f" == *backup*                 ]] && return 0
  return 1
}

# All candidate .html/.js files under public/, excluding forbidden paths.
# Not limited to a fixed list — detects endpoint references anywhere in the tree.
discover_files() {
  find "$PUBLIC_DIR" -type f \( -name "*.html" -o -name "*.js" \) 2>/dev/null | while IFS= read -r f; do
    is_forbidden "$f" || echo "$f"
  done
}

# ─── Per-file scan/replace (Python — safe on both macOS and Linux) ────────────
# Mode "scan":    report-only, never writes.
# Mode "replace": rewrites the file if any known endpoint is found, using
#                 TARGET_URL. Prints CHANGED or UNCHANGED as the last line.
# In both modes prints one "COUNT|<url>|<n>" line per known endpoint, plus
# "UNKNOWN|<n>" for endpoint-shaped strings that aren't in KNOWN_ENDPOINTS
# and aren't the TARGET_URL itself.
py_process_file() {
  local file="$1" mode="$2" target_url="${3:-}"
  KNOWN_ENDPOINTS_LIST="$(printf '%s\n' "${KNOWN_ENDPOINTS[@]}")" \
  TARGET_URL="$target_url" \
  MODE="$mode" \
  python3 - "$file" <<'PYEOF'
import os, re, sys

file_path = sys.argv[1]
known = [u for u in os.environ.get("KNOWN_ENDPOINTS_LIST", "").split("\n") if u]
target = os.environ.get("TARGET_URL", "")
mode = os.environ.get("MODE", "scan")

try:
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
except Exception as e:
    print(f"ERROR|{e}")
    sys.exit(0)

original = content

for u in known:
    n = content.count(u)
    print(f"COUNT|{u}|{n}")

# Detect endpoint-shaped strings not in the known list and not the target —
# a generic http(s)://host[:port] pattern, reported as UNKNOWN for visibility.
url_pattern = re.compile(r'https?://[a-zA-Z0-9\.\-]+(?::[0-9]+)?')
found_urls = set(url_pattern.findall(content))
known_set = set(known) | ({target} if target else set())
unknown_urls = [u for u in found_urls if u not in known_set]
print(f"UNKNOWN|{len(unknown_urls)}")
for u in sorted(unknown_urls):
    print(f"UNKNOWN_URL|{u}")

if mode == "replace" and target:
    changed = False
    for u in known:
        if u == target:
            continue
        if u in content:
            content = content.replace(u, target)
            changed = True
    if changed and content != original:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        print("RESULT|CHANGED")
    else:
        print("RESULT|UNCHANGED")
PYEOF
}

# ─── Scan (used by check and pre/post switch reporting) ───────────────────────
# Populates: DEV_COUNT PRODA_COUNT PRODB_COUNT UNKNOWN_COUNT DETECTED_MODE
scan_endpoints() {
  require_python
  head_line "Endpoint scan — $PUBLIC_DIR"

  DEV_COUNT=0
  PRODA_COUNT=0
  PRODB_COUNT=0
  UNKNOWN_COUNT=0
  local files
  files="$(discover_files)"

  if [[ -z "$files" ]]; then
    warn "No .html/.js files found under $PUBLIC_DIR"
  fi

  echo ""
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    local out
    out="$(py_process_file "$f" scan)"

    local dev_n=0 proda_n=0 prodb_n=0 unk_n=0
    while IFS= read -r line; do
      case "$line" in
        COUNT\|"$DEV_URL"\|*)    dev_n="${line##*|}" ;;
        COUNT\|"$PROD_A_URL"\|*) proda_n="${line##*|}" ;;
        COUNT\|"$PROD_B_URL"\|*) prodb_n="${line##*|}" ;;
        UNKNOWN\|*)              unk_n="${line#UNKNOWN|}" ;;
        UNKNOWN_URL\|*)          warn "  Unknown endpoint in ${f#$REPO_ROOT/}: ${line#UNKNOWN_URL|}" ;;
        ERROR\|*)                warn "  Could not read $f: ${line#ERROR|}" ;;
      esac
    done <<< "$out"

    local file_total=$(( dev_n + proda_n + prodb_n ))
    if [[ $file_total -gt 0 ]]; then
      echo "    ${f#$REPO_ROOT/}  (dev=$dev_n, prod-a=$proda_n, prod-b=$prodb_n)"
    fi

    DEV_COUNT=$((DEV_COUNT + dev_n))
    PRODA_COUNT=$((PRODA_COUNT + proda_n))
    PRODB_COUNT=$((PRODB_COUNT + prodb_n))
    UNKNOWN_COUNT=$((UNKNOWN_COUNT + unk_n))
  done <<< "$files"

  echo ""
  info "Totals — DEV: $DEV_COUNT   PROD A: $PRODA_COUNT   PROD B: $PRODB_COUNT   Unknown: $UNKNOWN_COUNT"

  local nonzero=0
  [[ $DEV_COUNT   -gt 0 ]] && nonzero=$((nonzero + 1))
  [[ $PRODA_COUNT -gt 0 ]] && nonzero=$((nonzero + 1))
  [[ $PRODB_COUNT -gt 0 ]] && nonzero=$((nonzero + 1))

  if [[ $nonzero -eq 0 ]]; then
    warn "Mode: NONE (no known API endpoints found in source files)"
    DETECTED_MODE="none"
  elif [[ $nonzero -gt 1 ]]; then
    warn "Mode: MIXED (references to more than one environment — action required)"
    DETECTED_MODE="mixed"
  elif [[ $DEV_COUNT -gt 0 ]]; then
    ok "Mode: DEV (all endpoints point to DEV)"
    DETECTED_MODE="dev"
  elif [[ $PRODA_COUNT -gt 0 ]]; then
    ok "Mode: PROD A (all endpoints point to PROD A)"
    DETECTED_MODE="prod-a"
  else
    ok "Mode: PROD B (all endpoints point to PROD B)"
    DETECTED_MODE="prod-b"
  fi

  if [[ $UNKNOWN_COUNT -gt 0 ]]; then
    warn "Found $UNKNOWN_COUNT unknown endpoint reference(s) not in the known list — see above."
  fi
}

# ─── Switch ─────────────────────────────────────────────────────────────────
do_switch() {
  local target_label="$1" target_url="$2"
  require_python

  local ts
  ts="$(date +"%Y%m%d_%H%M%S")"
  local changed=0
  CHANGED_FILES=()

  head_line "Switching to $target_label ($target_url) — $(date)"
  echo ""

  local files
  files="$(discover_files)"

  while IFS= read -r f; do
    [[ -z "$f" ]] && continue

    # Quick pre-check: does this file contain any known endpoint other than the target?
    local pre_out needs_change=0
    pre_out="$(py_process_file "$f" scan)"
    while IFS= read -r line; do
      case "$line" in
        COUNT\|*)
          local url="${line#COUNT|}"; url="${url%|*}"
          local n="${line##*|}"
          if [[ "$url" != "$target_url" && "$n" -gt 0 ]]; then
            needs_change=1
          fi
          ;;
      esac
    done <<< "$pre_out"

    if [[ $needs_change -eq 0 ]]; then
      continue
    fi

    local backup="${f}.backup_${ts}"
    cp "$f" "$backup"

    local out result="UNCHANGED"
    out="$(py_process_file "$f" replace "$target_url")"
    while IFS= read -r line; do
      case "$line" in
        RESULT\|*) result="${line#RESULT|}" ;;
      esac
    done <<< "$out"

    if [[ "$result" == "CHANGED" ]]; then
      ok "Updated: ${f#$REPO_ROOT/}  (backup: $(basename "$backup"))"
      changed=$((changed + 1))
      CHANGED_FILES+=("${f#$REPO_ROOT/}")
    else
      # Nothing actually changed after all (target already matched) — remove the unneeded backup
      rm -f "$backup"
    fi
  done <<< "$files"

  echo ""
  if [[ $changed -eq 0 ]]; then
    warn "No files were modified (source may already be fully on $target_label)."
  else
    ok "$changed file(s) updated."
  fi
}

# ─── Post-switch validation summary ────────────────────────────────────────
post_switch_summary() {
  local target_label="$1" target_url="$2"

  echo ""
  head_line "Validation"
  scan_endpoints

  echo ""
  info "Selected environment: $target_label"
  info "Selected URL:         $target_url"
  info "Files changed:        ${#CHANGED_FILES[@]}"
  if [[ ${#CHANGED_FILES[@]} -gt 0 ]]; then
    for cf in "${CHANGED_FILES[@]}"; do
      echo "    - $cf"
    done
  fi

  if [[ "$DETECTED_MODE" == "$target_label" || \
        ( "$target_label" == "prod-a" && "$DETECTED_MODE" == "prod-a" ) || \
        ( "$target_label" == "prod-b" && "$DETECTED_MODE" == "prod-b" ) || \
        ( "$target_label" == "dev" && "$DETECTED_MODE" == "dev" ) ]]; then
    ok "Source is fully consistent — all references point to $target_label."
  else
    err "Source is NOT fully consistent after switch — detected mode: $DETECTED_MODE"
  fi

  if [[ $UNKNOWN_COUNT -gt 0 ]]; then
    warn "Unknown/unrecognized endpoint references remain — review above."
  else
    ok "No mixed or unknown endpoint references remain."
  fi

  echo ""
  head_line "Next step"
  echo -e "${CYN}  When you are ready to sync to the iOS project, run:${RST}"
  echo ""
  echo "    npx cap copy ios"
  echo ""
  warn "Do NOT run that command automatically — run it only when ready."
}

# ─── Interactive menu ───────────────────────────────────────────────────────
show_menu() {
  echo ""
  echo "Select API environment:"
  echo ""
  echo "  1) DEV"
  echo "  2) PROD A"
  echo "  3) PROD B"
  echo "  4) CHECK CURRENT ENVIRONMENT"
  echo "  5) CANCEL"
  echo ""
  echo "Environment URLs:"
  echo ""
  echo "  DEV:"
  echo "    $DEV_URL"
  echo ""
  echo "  PROD A:"
  echo "    $PROD_A_URL"
  echo ""
  echo "  PROD B:"
  echo "    $PROD_B_URL"
  echo ""

  local choice
  while true; do
    read -r -p "Enter choice [1-5]: " choice
    case "$choice" in
      1) run_switch "dev" "$DEV_URL"; return ;;
      2) run_switch "prod-a" "$PROD_A_URL"; return ;;
      3) run_switch "prod-b" "$PROD_B_URL"; return ;;
      4) head_line "CHECK MODE — read-only, no files will be changed"; scan_endpoints; return ;;
      5) info "Cancelled — no changes made."; return ;;
      *) err "Invalid selection: \"$choice\" — enter a number from 1 to 5." ;;
    esac
  done
}

# ─── Orchestration for a real switch (used by both menu and CLI args) ────────
run_switch() {
  local target_label="$1" target_url="$2"

  head_line "SWITCH MODE → $target_label"
  echo ""
  info "Pre-switch state:"
  scan_endpoints
  echo ""

  do_switch "$target_label" "$target_url"

  post_switch_summary "$target_label" "$target_url"
}

# ─── Entry point ─────────────────────────────────────────────────────────────
MODE="${1:-}"

case "$MODE" in
  "")
    show_menu
    ;;

  check)
    head_line "CHECK MODE — read-only, no files will be changed"
    scan_endpoints
    ;;

  dev)
    run_switch "dev" "$DEV_URL"
    ;;

  prod-a)
    run_switch "prod-a" "$PROD_A_URL"
    ;;

  prod-b)
    run_switch "prod-b" "$PROD_B_URL"
    ;;

  *)
    echo ""
    err "Unknown argument: \"$MODE\""
    echo ""
    echo "Usage: $0 [dev|prod-a|prod-b|check]"
    echo ""
    echo "  (no argument) — interactive menu"
    echo "  dev           — switch all public/ source files to DEV     ($DEV_URL)"
    echo "  prod-a        — switch all public/ source files to PROD A  ($PROD_A_URL)"
    echo "  prod-b        — switch all public/ source files to PROD B  ($PROD_B_URL)"
    echo "  check         — report current endpoint state, no changes"
    echo ""
    exit 1
    ;;
esac
