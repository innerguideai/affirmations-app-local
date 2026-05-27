#!/usr/bin/env bash
# switch-api-env.sh — Switch frontend API endpoints between DEV and PROD safely.
#
# Usage:
#   ./scripts/switch-api-env.sh dev    — point all source files at DEV API
#   ./scripts/switch-api-env.sh prod   — point all source files at PROD API
#   ./scripts/switch-api-env.sh check  — report current state, no changes

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
DEV_API="http://54.221.158.219:3000"
PROD_API="https://api.innerguideai.com"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PUBLIC_DIR="$REPO_ROOT/public"

# Files known to contain endpoints. Add new files here as the codebase grows.
SOURCE_FILES=(
  "public/login.html"
  "public/my-top3.html"
  "public/verify-required.html"
  "public/js/login.js"
  "public/js/profile.api.js"
  "public/js/profile.js"
  "public/js/signup.js"
  "public/js/forgot.js"
  "public/js/reset.js"
  "public/js/support.js"
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
head()  { echo -e "\n${CYN}━━━ $* ━━━${RST}"; }

# Guard: never touch generated iOS copy or android/.claude
is_forbidden() {
  local f="$1"
  [[ "$f" == *"ios/App/App/public"* ]] && return 0
  [[ "$f" == *"android/.claude"* ]]    && return 0
  return 1
}

# Guard: never touch backup files
is_backup() {
  local f="$1"
  [[ "$f" == *.backup* ]] && return 0
  [[ "$f" == *.bak*     ]] && return 0
  [[ "$f" == *backup*   ]] && return 0
  return 1
}

# Return absolute path, checking it is inside PUBLIC_DIR
resolve_source_file() {
  local rel="$1"
  local abs="$REPO_ROOT/$rel"
  if is_forbidden "$abs"; then
    warn "Skipping forbidden path: $abs"
    return 1
  fi
  if is_backup "$abs"; then
    warn "Skipping backup file: $abs"
    return 1
  fi
  echo "$abs"
}

# Count occurrences of a string in a file
count_occurrences() {
  local needle="$1" file="$2"
  grep -c "$needle" "$file" 2>/dev/null || echo 0
}

# ─── Scan (used by both check and switch) ────────────────────────────────────
scan_endpoints() {
  local dev_total=0 prod_total=0

  head "Endpoint scan — $PUBLIC_DIR"

  # Also do a broad grep to catch any file not in SOURCE_FILES
  local broad_dev broad_prod
  broad_dev=$(grep -Rln --include="*.html" --include="*.js" \
    "54\.221\.158\.219\|54\.210\.216\.72\|localhost:3000" \
    "$PUBLIC_DIR" 2>/dev/null \
    | grep -v "backup\|\.bak\|\.backup" || true)
  broad_prod=$(grep -Rln --include="*.html" --include="*.js" \
    "api\.innerguideai\.com" \
    "$PUBLIC_DIR" 2>/dev/null \
    | grep -v "backup\|\.bak\|\.backup" || true)

  echo ""
  info "Files with DEV endpoint ($DEV_API):"
  if [[ -z "$broad_dev" ]]; then
    echo "    (none)"
  else
    while IFS= read -r f; do
      local n
      n=$(grep -c "54\.221\.158\.219\|54\.210\.216\.72\|localhost:3000" "$f" 2>/dev/null || true)
      echo "    $f  ($n occurrence(s))"
      dev_total=$((dev_total + n))
    done <<< "$broad_dev"
  fi

  echo ""
  info "Files with PROD endpoint ($PROD_API):"
  if [[ -z "$broad_prod" ]]; then
    echo "    (none)"
  else
    while IFS= read -r f; do
      local n
      n=$(grep -c "api\.innerguideai\.com" "$f" 2>/dev/null || true)
      echo "    $f  ($n occurrence(s))"
      prod_total=$((prod_total + n))
    done <<< "$broad_prod"
  fi

  echo ""
  # Determine mode
  if   [[ $dev_total -gt 0 && $prod_total -eq 0 ]]; then
    ok  "Mode: DEV  (all endpoints point to DEV)"
    DETECTED_MODE="dev"
  elif [[ $prod_total -gt 0 && $dev_total -eq 0 ]]; then
    ok  "Mode: PROD (all endpoints point to PROD)"
    DETECTED_MODE="prod"
  elif [[ $dev_total -eq 0 && $prod_total -eq 0 ]]; then
    warn "Mode: NONE (no known API endpoints found in source files)"
    DETECTED_MODE="none"
  else
    warn "Mode: MIXED (${dev_total} DEV + ${prod_total} PROD references — action required)"
    DETECTED_MODE="mixed"
  fi

  DEV_COUNT=$dev_total
  PROD_COUNT=$prod_total
}

# ─── Switch ──────────────────────────────────────────────────────────────────
do_switch() {
  local target_mode="$1"   # "dev" or "prod"
  local from_url to_url
  if [[ "$target_mode" == "dev" ]]; then
    from_url="$PROD_API"
    to_url="$DEV_API"
  else
    from_url="$DEV_API"
    to_url="$PROD_API"
  fi

  local ts
  ts=$(date +"%Y%m%d_%H%M%S")
  local changed=0

  head "Switching to $target_mode — $(date)"

  for rel in "${SOURCE_FILES[@]}"; do
    local abs
    abs=$(resolve_source_file "$rel") || continue

    if [[ ! -f "$abs" ]]; then
      info "Not found (skipping): $rel"
      continue
    fi

    # Check whether this file has anything to change
    local has_from has_old_dev
    has_from=$(grep -cF "$from_url" "$abs" 2>/dev/null || true)

    # Also check for the other DEV variant (old IP, localhost) when switching to prod
    has_old_dev=0
    if [[ "$target_mode" == "prod" ]]; then
      has_old_dev=$(grep -cE "54\.210\.216\.72|localhost:3000" "$abs" 2>/dev/null || true)
    fi

    if [[ "$has_from" -eq 0 && "$has_old_dev" -eq 0 ]]; then
      info "No change needed: $rel"
      continue
    fi

    # Create timestamped backup
    local backup="${abs}.backup_${ts}"
    cp "$abs" "$backup"
    ok "Backup created: $(basename "$backup")"

    # Perform replacement (sed -i is portable with empty string on macOS)
    if [[ "$has_from" -gt 0 ]]; then
      sed -i "" "s|${from_url}|${to_url}|g" "$abs"
    fi

    # When switching to prod, also clean up any leftover old DEV IPs / localhost
    if [[ "$target_mode" == "prod" && "$has_old_dev" -gt 0 ]]; then
      sed -i "" "s|http://54\.210\.216\.72:[0-9]*/|${to_url}/|g" "$abs"
      sed -i "" "s|http://localhost:3000|${to_url}|g" "$abs"
    fi

    ok "Updated:        $rel"
    changed=$((changed + 1))
  done

  echo ""
  if [[ $changed -eq 0 ]]; then
    warn "No files were modified (source may already be in $target_mode mode)."
  else
    ok "$changed file(s) updated."
  fi
}

# ─── Entry point ─────────────────────────────────────────────────────────────
MODE="${1:-}"

case "$MODE" in
  check)
    head "CHECK MODE — read-only, no files will be changed"
    DETECTED_MODE="" DEV_COUNT=0 PROD_COUNT=0
    scan_endpoints
    ;;

  dev|prod)
    head "SWITCH MODE → $MODE"
    DETECTED_MODE="" DEV_COUNT=0 PROD_COUNT=0

    echo ""
    info "Pre-switch state:"
    scan_endpoints
    echo ""

    do_switch "$MODE"

    echo ""
    info "Post-switch state:"
    DETECTED_MODE="" DEV_COUNT=0 PROD_COUNT=0
    scan_endpoints

    echo ""
    head "Next step"
    echo -e "${CYN}  When you are ready to sync to the iOS project, run:${RST}"
    echo ""
    echo "    npx cap copy ios"
    echo ""
    warn "Do NOT run that command automatically — run it only when ready."
    ;;

  *)
    echo ""
    err "Usage: $0 {dev|prod|check}"
    echo ""
    echo "  dev   — switch all public/ source files to DEV  ($DEV_API)"
    echo "  prod  — switch all public/ source files to PROD ($PROD_API)"
    echo "  check — report current endpoint state, no changes"
    echo ""
    exit 1
    ;;
esac
