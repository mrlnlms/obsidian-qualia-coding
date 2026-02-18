---
version: 28.3
engine: csv-viewer
date: 2026-02-18
---

# What's new in v28.3

Coding cells with tag buttons and chips in the CSV Viewer engine:

- **Cell tag buttons**: Click cells in `cod-seg` and `cod-frow` columns to add tags
- **Tag chips layout**: Tags appear as colored chips inside coding cells (test mode)
- **Source column tagging**: Tag button appears in the source column when `cod-seg` is enabled

## How to verify

1. Open `Daily Count Jan 26.csv` in the vault
2. Look for columns with `cod-seg` or `cod-frow` in the header
3. Click on cells in those columns — a tag button should appear
4. Click the tag button to add colored tag chips to the cell
5. Check the source column — when `cod-seg` is enabled, it should also show a tag button
6. Tags display as colored chips inside the cells
