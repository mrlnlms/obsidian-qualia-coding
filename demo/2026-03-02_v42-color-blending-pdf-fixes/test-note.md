---
tags: [qualia-coding, test, v42]
---

# v42 — Color blending PDF + fixes

## What's new
- **Per-code color blending** in PDF highlights: when a segment has multiple codes, each code's color is rendered as a separate translucent layer that blends visually
- **Parquet extension** now stripped from file names in the sidebar (detail + explorer views)
- **CSS fix**: removed corrupted hover rule (`.codemarker-detail-marker-item:hover,` dangling comma) that caused flicker on segment hover in the sidebar

## How to verify
1. Open a PDF file and create a marker with 2+ codes assigned
2. The highlight should show blended colors (layered translucent rectangles)
3. Hover over a segment in the sidebar — no flicker
4. Open a .parquet file — the sidebar should show the filename without `.parquet` extension
