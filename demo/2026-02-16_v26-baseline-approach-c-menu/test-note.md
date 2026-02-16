---
version: 26
date: 2026-02-16
title: "Baseline: Approach C menu + ARCHITECTURE.md + DEVELOPMENT.md"
source: local-plugin (obsidian-codemarker-v2 @ 0c654c2)
---

# v26 — Baseline: Approach C menu

## What's new
- Approach C menu system baseline — refined menu controller with obsidian-native menus
- ARCHITECTURE.md and DEVELOPMENT.md added to source (excluded from port per porting rules)
- Continued refinement of CM6 decorations, state field, and view plugin

## How to verify
1. Open console: should see `[CodeMarker v2] v26 loaded`
2. Select text in any note — menu should appear (if enabled in settings)
3. Right-click selected text — "Code Options" should appear in context menu
4. Settings tab should be accessible and functional

## Demo content

Select this paragraph to test the selection menu trigger. The Approach C menu uses Obsidian's native Menu API for right-click integration and a custom DOM-based menu for selection-triggered coding.

Try coding this sentence with different codes to verify marker decorations render correctly.
