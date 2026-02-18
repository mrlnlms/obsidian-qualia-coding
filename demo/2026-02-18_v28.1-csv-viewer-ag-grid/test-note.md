---
version: 28.1
date: 2026-02-18
engine: obsidian-csv-viewer
---

# v28.1 — Initial CSV Viewer with AG Grid

## What's new
- First appearance of the CSV Viewer engine plugin
- Opens .csv files as interactive AG Grid tables
- Registered as a custom view type for .csv extension
- Separate plugin in the demo vault (multi-plugin Era 3 architecture)

## How to verify
1. Open the developer console — confirm `[CSV Viewer] v28.1 loaded` appears
2. Click on `Daily Count Jan 26.csv` in the file explorer
3. The file should open as an interactive table (AG Grid), not raw text
4. Columns should be sortable and resizable

## Test content
Open the CSV file in the vault root: `Daily Count Jan 26.csv`
