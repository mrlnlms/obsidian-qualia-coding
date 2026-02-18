---
version: 28.2
engine: obsidian-csv-viewer
date: 2026-02-18
---

# CSV Viewer v28.2 — Info bar + column toggle + header tag button

## What's new
- **Info bar**: Shows row count and column count at the bottom of the CSV view
- **Column toggle modal**: Allows hiding/showing columns via a modal interface
- **Header tag button**: Click a column header to tag it, with correct positioning and hover style
- Async CSV parsing for better performance on large files

## How to verify
1. Open `Daily Count Jan 26.csv` — it should open in the CSV Viewer
2. Check the bottom of the view for the info bar showing row/column counts
3. Look for column toggle functionality (modal to show/hide columns)
4. Click on a column header to see the tag button with hover styling
5. Try with `items.csv` to confirm both files work

## Test content
Open any `.csv` file in the vault to trigger the CSV Viewer engine.
