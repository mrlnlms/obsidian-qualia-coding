---
tags: [codemarker, image, test]
version: "34.4"
---

# v34.4 — Auto-open images + settings tab

## What's new

- **Auto-open images**: When enabled in settings, clicking any image file in the file explorer automatically opens it in the CodeMarker Image view instead of the default Obsidian image viewer.
- **Settings tab**: New settings panel for CodeMarker Image with toggles for auto-open behavior and other preferences.

## How to verify

1. Open Settings > Community Plugins > CodeMarker Image — confirm the settings tab appears
2. Enable "Auto-open images" in the settings
3. Click any image file in the file explorer (e.g., the test images from v34.2)
4. Confirm the image opens in CodeMarker Image view (Fabric.js canvas) instead of the default viewer
5. Disable the setting and click an image again — it should open in the default Obsidian viewer
6. Check console for: `[codemarker-image] v34.4 loaded`
