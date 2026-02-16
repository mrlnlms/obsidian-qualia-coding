---
codes:
  - name: "Design Pattern"
    color: "#4CAF50"
  - name: "User Flow"
    color: "#2196F3"
  - name: "Edge Case"
    color: "#FF9800"
---

# v27.7 — Bidirectional Hover Underline

## What's new
- **Bidirectional hover**: hovering a marker in the text underlines the corresponding label in the margin panel, and vice versa
- **Per-element underline**: each marker gets its own underline effect on hover, not a blanket highlight
- Margin panel and inline markers are now visually linked through hover interaction

## How to verify
1. Open this note and ensure the margin panel is visible
2. Hover over a coded span in the text — the corresponding margin label should show an underline
3. Hover over a label in the margin panel — the inline marker in the text should respond with an underline
4. Verify that hovering one marker does not affect unrelated markers

This is a ==Design Pattern== example showing how the bidirectional hover connects inline markers to their margin panel labels.

Here is a ==User Flow== span that should independently highlight when hovered.

And an ==Edge Case== marker to test that per-element targeting works correctly with multiple codes.
