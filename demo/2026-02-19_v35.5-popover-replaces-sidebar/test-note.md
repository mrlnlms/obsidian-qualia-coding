---
codemarker-engine: pdf
version: "35.5"
---

# v35.5 — Popover replaces sidebar + hover trigger

## What's new

The PDF engine now uses a **popover** instead of the sidebar for inspecting coded highlights. Hovering over a highlight opens a popover showing code details directly near the highlight, replacing the previous click-to-sidebar interaction.

This is a significant UX shift: inspection is now **hover-driven** rather than click-driven, making the workflow faster and less disruptive.

## How to verify

1. Open a PDF file in the demo vault (e.g., `Claude.pdf` or `User Research Study.pdf`)
2. Create a coded highlight on some text if none exist
3. **Hover** over an existing highlight — a popover should appear near the highlight showing code details
4. Move the mouse away — the popover should close
5. Confirm the old click-to-sidebar behavior is replaced by the new hover popover
