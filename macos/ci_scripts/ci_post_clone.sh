#!/bin/bash
set -euo pipefail

echo "=== Xcode Cloud: macOS post-clone setup ==="

cd "$CI_PRIMARY_REPOSITORY_PATH"

# --- Install tooling ---
echo "Installing Node.js..."
brew install node

echo "Installing Bun..."
curl -fsSL https://bun.sh/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# --- npm registry for @sudobility packages (GitHub Packages) ---
# @sudobility/* moved off npmjs to GitHub Packages (npm.pkg.github.com); the
# committed .npmrc routes the scope there, so CI must supply a read:packages
# token or every @sudobility download 401s. Set GITHUB_PACKAGE_TOKEN (a GitHub
# PAT with read:packages) as a Secret environment variable in the Xcode Cloud
# workflow; NPM_TOKEN is still accepted as a fallback name for the same value.
GH_PKG_TOKEN="${GITHUB_PACKAGE_TOKEN:-${NPM_TOKEN:-}}"
if [ -n "$GH_PKG_TOKEN" ]; then
  echo "Configuring GitHub Packages registry for @sudobility..."
  cat > "$HOME/.npmrc" << EOF
@sudobility:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GH_PKG_TOKEN}
EOF
else
  echo "WARNING: no GITHUB_PACKAGE_TOKEN/NPM_TOKEN set; @sudobility installs will 401" >&2
fi

# --- Install JS dependencies ---
echo "Installing JS dependencies..."
bun install --frozen-lockfile

# --- Write environment variables ---
# Every variable .env.example declares, valued from the workflow's Environment
# Variables (Xcode Cloud > Workflow > Environment; mark sensitive ones Secret).
# The names are read from .env.example rather than listed here, so this file
# cannot fall behind what the app reads. A name the workflow does not set is
# written blank, which the app reads as "not configured".
: > .env
for name in $(sed -n 's/^\([A-Z][A-Z0-9_]*\)=.*/\1/p' .env.example); do
  printf '%s=%s\n' "$name" "$(printenv "$name" || true)" >> .env
done
echo "Wrote .env with $(wc -l < .env | tr -d ' ') variables."

# --- Install CocoaPods ---
echo "Installing CocoaPods dependencies..."
cd macos
pod install

echo "=== macOS post-clone setup complete ==="
