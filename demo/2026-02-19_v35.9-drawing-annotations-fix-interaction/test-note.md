---
version: "35.9"
engine: codemarker-pdf
date: 2026-02-19
---

# v35.9 — Drawing Annotations + Fix Interaction

## What's new

- **Drawing annotations**: Draw rect, ellipse, and polygon shapes directly on PDF pages for visual markup beyond text highlights
- **Shape hover popover**: Hover over a drawn shape to see annotation details in a popover
- **Interaction fix**: Fixed conflicts between drawing tools and existing PDF highlight/selection features

## How to verify

1. Open a PDF file in the demo vault
2. Use the drawing tools (rect, ellipse, polygon) to draw shapes on a PDF page
3. Hover over a drawn shape — a popover should appear with annotation details
4. Verify that text selection and existing highlights still work correctly alongside drawing tools
5. Check that pointer events do not conflict between drawn shapes and text highlights
