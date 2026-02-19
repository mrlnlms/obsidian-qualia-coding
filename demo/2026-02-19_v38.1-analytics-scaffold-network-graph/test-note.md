---
tags: [test, analytics, v38]
---

# v38.1 — Analytics Engine: Scaffold + Network Graph

## What's new
- New engine: **codemarker-analytics** — cross-engine data consolidation and visualization
- Reads coded data from markdown, CSV, and image engines
- Network graph visualization showing relationships between codes
- Command palette: "Open CodeMarker Analytics" and "Refresh Analytics Data"

## How to verify
1. Enable `obsidian-codemarker-analytics` in Settings > Community Plugins
2. Open command palette > "Open CodeMarker Analytics"
3. The analytics view should open in a new tab
4. Use "Refresh Analytics Data" to reload data from other engines
5. Check console for `[codemarker-analytics] v38.1 loaded`
6. Network graph should visualize code relationships across engines
