---
version: 28.5
engine: obsidian-csv-viewer
date: 2026-02-18
---

# What's new in v28.5

- **Comment column**: New dedicated column for adding comments/annotations to CSV rows
- **Clickable chips**: Tag/code chips are now clickable for interaction
- **Fix rowIndex**: Corrected row index tracking after sorting/filtering operations

# How to verify

1. Open `Daily Count Jan 26.csv` in the vault
2. Check that the Comment column appears in the grid
3. Click on any tag/code chip — it should respond to clicks
4. Sort a column and verify row indices remain correct
5. Console should show: `[obsidian-csv-viewer] v28.5 loaded`
