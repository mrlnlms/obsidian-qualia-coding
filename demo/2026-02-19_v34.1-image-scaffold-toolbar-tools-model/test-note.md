---
tags: [codemarker, image, test]
version: "34.1"
---

# v34.1 — CodeMarker Image: Scaffold + Toolbar + Tools + Model

## What's new
- New engine plugin: **obsidian-codemarker-image**
- Plugin scaffold with Fabric.js canvas integration
- Toolbar UI with zoom/pan infrastructure
- Region drawing tools: rectangle, ellipse, freeform polygon
- Image coding model with persistence and region manager

## How to verify
1. Right-click an image file (e.g., `Pasted image 20260216114853.png`) in the file explorer
2. Select "Open in CodeMarker Image" from the context menu
3. The image should open in a custom view with a toolbar
4. Try drawing regions using rect, ellipse, and freeform polygon tools
5. Check console for: `[CodeMarker Image] v34.1 loaded`

## Test images
- `Pasted image 20260216114853.png` — screenshot for annotation testing
- `original-88d78341487bd94fac95ae37737a6b42-1024x683.jpg` — photo for region drawing
