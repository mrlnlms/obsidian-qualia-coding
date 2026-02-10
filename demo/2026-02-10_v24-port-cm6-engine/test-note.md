---
version: 24
date: 2026-02-10
title: Port CM6 engine from obsidian-codemarker
type: main-plugin
---

# v24 — Port CM6 engine from obsidian-codemarker

## What's new
- Ported the full CM6 engine from obsidian-codemarker into obsidian-codemarker-v2
- StateField + ViewPlugin architecture for marker decorations
- CodeMarkerModel for data management
- Settings tab and commands (create marker, reset markers)

## How to verify
1. Open console: should see `[CodeMarker v2] v24 loaded`
2. Select text and run command "Create marker from selection"
3. Run "Reset all markers" to clear

## Demo content

Select this paragraph and use the command palette to create a marker. The text should receive a decoration via CM6 StateField/ViewPlugin pipeline.

Another paragraph to test multiple markers across different positions in the document.
