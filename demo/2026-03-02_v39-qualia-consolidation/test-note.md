---
codes:
  - name: consolidation
    color: "#4CAF50"
    ranges:
      - [0, 50]
---

# Qualia Coding v39 — Consolidation

## What's new in v39

The 7 independent CodeMarker engines (markdown, PDF, CSV, image, audio, video, analytics) have been consolidated into a single plugin: **Qualia Coding**.

- Single plugin replaces 7 separate plugins
- Shared code registry across all engines
- Unified explorer and detail views
- File interceptor auto-opens the correct engine view

## How to verify

1. Open the console — look for `[Qualia Coding] v39 loaded`
2. Only one plugin should appear in Settings → Community Plugins: "Qualia Coding"
3. Open a `.md` file — markdown coding should work (select text, right-click to code)
4. Open a `.csv` file — CSV viewer should activate
5. Open a `.pdf` file — PDF coding should activate
6. Try the code explorer sidebar (left panel icon)

## Test content

This is a test paragraph for ==marking text with codes==. Select any text and use the coding menu to apply qualitative codes.

The consolidation means all engines share the same code definitions — a code created while analyzing a PDF is immediately available when coding markdown or images.
