---
tags: [test, codemarker-csv, v33]
---

# v33.1 — CodeMarker CSV: Unified sidebar + reveal on click

## What's new
- **New engine: obsidian-codemarker-csv** — evolution of csv-viewer, now with full CodeMarker integration
- **Unified Code Detail sidebar** — single sidebar view for code details, replacing scattered leaves
- **Reveal on click** — clicking a code marker in the CSV view always reveals the unified detail sidebar
- Legacy leaf cleanup on load

## How to verify
1. Open the command palette and check for CodeMarker CSV commands
2. Open `Daily Count Jan 26.csv` — should render in the CSV coding view
3. Click on a code marker — the unified detail sidebar should appear/reveal
4. Check console for: `[obsidian-codemarker-csv] v33.1 loaded`

## Test content
Open any `.csv` file in this vault to test the CSV coding view with the new unified sidebar.
