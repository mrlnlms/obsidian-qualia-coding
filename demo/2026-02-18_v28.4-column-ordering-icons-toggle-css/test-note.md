---
version: 28.4
engine: csv-viewer
date: 2026-02-18
---

# v28.4 — Column ordering fix + icons + toggle setting + CSS polish

## What's new

- **cod-seg column ordering**: cod-seg now always inserts right after the source column, regardless of column order
- **Header icons**: Info icon with tooltip on cod-seg header; tag icon on cod-frow header
- **COD_SEG_CELL_TAG_BTN toggle**: New setting to enable/disable the tag button in cod-seg cells
- **CSS polish**: cod-seg cells use italic + 1px font size, cod-frow gets lighter gray background, improved tooltip text

## How to verify

1. Open `Daily Count Jan 26.csv` in the vault
2. Check that the cod-seg column appears immediately after the source column
3. Look for the info icon in the cod-seg header — hover to see the tooltip
4. Look for the tag icon in the cod-frow header
5. Verify cod-seg cells have italic styling
6. Verify cod-frow cells have a lighter gray background
