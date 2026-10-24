#!/bin/bash
# Localize the RN app (full style, modeled on svgr_app_rn / sudojo_app_rn).
#
# Shared namespace files are copied verbatim from the web app (raidr_agent_app) so both
# apps stay in sync; they are already fully translated, so the API skips them.
# RN-only namespaces are then translated. If there are no shared namespaces, or
# the web app's locales are absent, the copy step is skipped.
#
# Usage:
#   bun run localize            # remote API
#   bun run localize:local      # local API
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RN_LOCALES="$PROJECT_DIR/assets/locales"
WEB_LOCALES="$PROJECT_DIR/../raidr_agent_app/public/locales"

SHARED_FILES=()

API_URL="${1:-https://api.whisperly.dev/api/v1/translate/jie9cytr/starter}"

# -- Step 1: Copy shared namespace files from the web app ----------------------
if [ ${#SHARED_FILES[@]} -gt 0 ] && [ -d "$WEB_LOCALES" ]; then
  echo "Copying shared locale files from raidr_agent_app..."
  copied=0
  for lang_dir in "$RN_LOCALES"/*/; do
    [ -d "$lang_dir" ] || continue
    lang="$(basename "$lang_dir")"
    for file in "${SHARED_FILES[@]}"; do
      src="$WEB_LOCALES/$lang/$file"
      dst="$RN_LOCALES/$lang/$file"
      if [ -f "$src" ]; then
        cp "$src" "$dst"
        copied=$((copied + 1))
      fi
    done
  done
  echo "  Copied $copied files."
elif [ ${#SHARED_FILES[@]} -gt 0 ]; then
  echo "Web app locales not found at $WEB_LOCALES; skipping shared copy."
else
  echo "No shared namespaces; skipping copy step."
fi

# -- Step 2: Run translation API (already-translated shared files are skipped) -
echo "Running translation API..."
LOCALIZE_SCRIPT="$(mktemp)"
curl -fsSL https://raw.githubusercontent.com/johnqh/workflows/main/scripts/localize_batch.cjs -o "$LOCALIZE_SCRIPT"
WHISPERLY_API_KEY="$(grep -h '^WHISPERLY_API_KEY=' ~/.develop/.keys ~/.keys ~/.keys.txt 2>/dev/null | head -1 | cut -d= -f2-)" node "$LOCALIZE_SCRIPT" "$RN_LOCALES" "$API_URL"
rm -f "$LOCALIZE_SCRIPT"

# -- Step 3: Format ------------------------------------------------------------
echo "Formatting..."
cd "$PROJECT_DIR"
npx prettier "assets/locales/**/*.json" --write
echo "Done."
