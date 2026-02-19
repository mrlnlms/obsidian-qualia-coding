---
version: "35.6"
engine: codemarker-pdf
date: 2026-02-19
---

# v35.6 — Pointer-events fix + smart layering

## What's new

- **Pointer-events fix**: Highlight overlays no longer block mouse interaction with the PDF text underneath. You can now select text, click links, and interact normally even when the text is covered by a coded highlight.
- **Smart layering**: When multiple markers overlap on the same passage, the smallest marker is rendered on top. This ensures that small nested markers remain clickable and visible even when covered by larger markers.

## How to verify

1. Open any PDF in the demo vault
2. Create two overlapping highlights — one large (spanning a paragraph) and one small (just a few words within that paragraph)
3. Verify the small highlight appears on top and is clickable
4. Try selecting text that sits under an existing highlight — the selection should work normally without the highlight intercepting pointer events
5. Check console for `[codemarker-pdf] v35.6 loaded`
