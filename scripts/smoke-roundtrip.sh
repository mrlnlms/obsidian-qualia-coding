#!/usr/bin/env bash
# Prepares a clean target vault for QDPX round-trip smoke testing.
#
# Workbench vault (source) stays as-is — you already have markers there.
# Target vault is wiped and recreated with the plugin installed + enabled.
#
# Manual steps are printed at the end.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_VAULT="${HOME}/Desktop/temp-roundtrip"
PLUGIN_ID="qualia-coding"

cd "$REPO_DIR"

# ── 1. Build (skip with SKIP_BUILD=1 ./scripts/smoke-roundtrip.sh) ───
if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "==> Building plugin..."
  npm run build
else
  echo "==> Skipping build (SKIP_BUILD=1)"
fi

if [[ ! -f "$REPO_DIR/main.js" ]]; then
  echo "!! main.js not found at $REPO_DIR — run 'npm run build' first" >&2
  exit 1
fi

# ── 2. Wipe & recreate target vault ──────────────────────────────────
if [[ -d "$TARGET_VAULT" ]]; then
  echo "==> Wiping existing $TARGET_VAULT"
  rm -rf "$TARGET_VAULT"
fi

PLUGIN_DIR="$TARGET_VAULT/.obsidian/plugins/$PLUGIN_ID"
mkdir -p "$PLUGIN_DIR"
echo "==> Created $TARGET_VAULT"

# ── 3. Install plugin artifacts ──────────────────────────────────────
cp -p "$REPO_DIR/main.js" "$PLUGIN_DIR/"
cp -p "$REPO_DIR/manifest.json" "$PLUGIN_DIR/"
cp -p "$REPO_DIR/styles.css" "$PLUGIN_DIR/"
echo "==> Installed plugin in $PLUGIN_DIR"

# ── 4. Enable plugin on first open ───────────────────────────────────
cat > "$TARGET_VAULT/.obsidian/community-plugins.json" <<EOF
[
  "$PLUGIN_ID"
]
EOF

# Trust flag so Obsidian doesn't prompt about community plugins
cat > "$TARGET_VAULT/.obsidian/app.json" <<'EOF'
{
  "trustedPlugin": true
}
EOF
echo "==> Enabled '$PLUGIN_ID' (community-plugins.json)"

# ── 5. Instructions ──────────────────────────────────────────────────
cat <<EOF

════════════════════════════════════════════════════════════════
  READY — manual steps below
════════════════════════════════════════════════════════════════

SOURCE vault (you already have markers here):
  $HOME/Desktop/obsidian-plugins-workbench

TARGET vault (clean, ready to import):
  $TARGET_VAULT

───────────────────────────────────────────────────────────────
  In the SOURCE vault (workbench):
───────────────────────────────────────────────────────────────
  1. Open a PDF (ideally non–Letter: A4 595×842 tests the I1 fix)
  2. Make 2–3 text markers + 2–3 shape markers on it
  3. Command palette → "Qualia Coding: Export project"
     → pick QDPX, save the .qdpx somewhere you'll find it
     (e.g. ~/Desktop/roundtrip.qdpx)

───────────────────────────────────────────────────────────────
  In the TARGET vault (temp-roundtrip):
───────────────────────────────────────────────────────────────
  4. Open Obsidian → "Open folder as vault" → $TARGET_VAULT
  5. Command palette → "Qualia Coding: Import QDPX"
     → pick the .qdpx from step 3

───────────────────────────────────────────────────────────────
  What to validate:
───────────────────────────────────────────────────────────────
  ✓ Text markers: highlights paint on the same passages
  ✓ Shape markers: rectangles cover the same regions
    (if PDF is A4 and fix I1 works, position is exact —
     before, they were ~3% off because of 612×792 default)
  ✓ Codes appear in the codebook sidebar

───────────────────────────────────────────────────────────────
  To reset just state (keep plugin installed):
───────────────────────────────────────────────────────────────
  rm -rf "$TARGET_VAULT/.obsidian/plugins/$PLUGIN_ID/data.json"
  rm -rf "$TARGET_VAULT/imports"

  Or re-run this script to wipe everything:
  $0

EOF
