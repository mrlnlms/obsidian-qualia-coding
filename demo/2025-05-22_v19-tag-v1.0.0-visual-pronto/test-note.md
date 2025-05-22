---
version: 19
tag: v1.0.0
date: 2025-05-22
source: github (faa2a0b)
description: "TAG v1.0.0 — Visual pronto, falta interacoes"
---

# v19 — TAG v1.0.0: Visual pronto, falta interacoes

## What's new
- Tag v1.0.0 — visual implementation complete
- CodeMirror 6 markers rendering correctly with styled highlights
- Handles visible on marked text
- Missing: visual interactions (drag, resize, click behaviors)

## How to verify
1. Open console: should see `[CodeMarker] v19 loaded`
2. Create markers on text — highlights should render with correct colors
3. Handles should be visible on marked segments
4. Note: interactions (drag/resize) are not yet implemented

## Demo content

This is a test paragraph for creating code markers. Select any text and use the command palette to create a new marker.

Another paragraph to test multiple markers in the same document. The visual rendering should be complete even though interactions are still pending.
