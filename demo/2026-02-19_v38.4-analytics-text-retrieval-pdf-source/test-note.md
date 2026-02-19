---
tags: [analytics, text-retrieval, pdf]
version: 38.4
date: 2026-02-19
---

# v38.4 — Text Retrieval + PDF Source

## What's new
- **Text Retrieval view**: New analytics view mode that retrieves and displays the original text segments associated with coded markers
- **PDF source support**: Analytics engine can now read and consolidate data from PDF-based codemarker annotations alongside markdown, CSV, and image sources

## How to verify
1. Open command palette > "Open CodeMarker Analytics"
2. Check that Text Retrieval view mode is available
3. If PDF annotations exist, verify they appear in the consolidated data
4. Console should show: `[obsidian-codemarker-analytics] v38.4 loaded`
