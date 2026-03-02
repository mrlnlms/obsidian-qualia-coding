---
codes:
  - name: "hover-test"
    color: "#4CAF50"
  - name: "parquet-test"
    color: "#2196F3"
---

# v41 — Fix hover/handles + Parquet CSV engine

## What's new
- **Fix:** Hover menu and handles no longer break after renaming a markdown file
- **Feat:** CSV engine now supports Parquet files via hyparquet library

## How to verify

### Hover/handles fix
1. Open a markdown file with coded segments
2. Rename the file (F2 or right-click → Rename)
3. Hover over a coded segment — the hover menu and handles should still work
4. Previously they would break until plugin reload

### Parquet support
1. Place a `.parquet` file in the vault
2. Open it — should render as a table via the CSV engine
3. Coding workflow should work the same as with CSV files

## Test content

This paragraph has some text that can be ==highlighted== and coded to verify the hover menu works after file operations.

> Rename this file and check if hover menus still appear on coded segments.
